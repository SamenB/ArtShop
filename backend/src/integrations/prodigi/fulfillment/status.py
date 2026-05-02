from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select

from src.models.orders import OrdersOrm
from src.models.prodigi_fulfillment import (
    ProdigiFulfillmentEventOrm,
    ProdigiFulfillmentJobOrm,
    ProdigiFulfillmentShipmentOrm,
)

SUCCESS_OUTCOMES = {"created", "onhold", "createdwithissues", "alreadyexists"}


def extract_order_data(event: dict[str, Any]) -> dict[str, Any]:
    data = event.get("data") if isinstance(event.get("data"), dict) else {}
    for value in (
        data.get("order"),
        event.get("order"),
        data.get("resource"),
        event.get("resource"),
        data,
    ):
        if isinstance(value, dict) and (value.get("id") or value.get("status")):
            return value
    return {}


def extract_stage(event: dict[str, Any], order_data: dict[str, Any]) -> str | None:
    status_data = order_data.get("status") if isinstance(order_data.get("status"), dict) else {}
    return status_data.get("stage") or stage_from_event_type(event.get("type"))


def stage_from_event_type(event_type: Any) -> str | None:
    raw = str(event_type or "")
    if "#" not in raw:
        return None
    return raw.rsplit("#", 1)[-1] or None


def job_status_from_order_payload(order_data: dict[str, Any], *, outcome: str | None = None) -> str:
    normalized_outcome = str(outcome or "").replace(" ", "").lower()
    status_data = order_data.get("status") if isinstance(order_data.get("status"), dict) else {}
    issues = status_data.get("issues") or []
    stage = str(status_data.get("stage") or "").lower()
    if normalized_outcome == "createdwithissues" or issues:
        return "issue"
    if normalized_outcome == "onhold" or stage in {"onhold", "on hold"}:
        return "on_hold"
    if normalized_outcome == "alreadyexists":
        return "submitted"
    if stage == "complete":
        return "complete"
    if stage == "cancelled":
        return "cancelled"
    if stage == "inprogress":
        return "in_progress"
    return "submitted" if normalized_outcome in SUCCESS_OUTCOMES else "failed"


def apply_order_status_to_job(
    *,
    job: ProdigiFulfillmentJobOrm | None,
    order_data: dict[str, Any],
    response_payload: dict[str, Any] | None = None,
    outcome: str | None = None,
) -> None:
    if job is None:
        return
    status_data = order_data.get("status") if isinstance(order_data.get("status"), dict) else {}
    issues = status_data.get("issues") if isinstance(status_data.get("issues"), list) else []
    job.latest_status_payload = order_data or None
    if response_payload is not None:
        job.response_payload = response_payload
        if response_payload.get("traceParent"):
            job.trace_parent = str(response_payload["traceParent"])
    job.status_stage = status_data.get("stage")
    job.status_details = (
        status_data.get("details") if isinstance(status_data.get("details"), dict) else None
    )
    job.issues = issues
    mapped_status = job_status_from_order_payload(order_data, outcome=outcome)
    if mapped_status != "submitted" or job.status not in {"submitted", "in_progress", "complete"}:
        job.status = mapped_status
    if order_data.get("id"):
        job.prodigi_order_id = str(order_data["id"])
    if mapped_status in {"submitted", "in_progress", "on_hold", "issue", "complete"}:
        job.submitted_at = job.submitted_at or datetime.now(timezone.utc).replace(tzinfo=None)
    if issues:
        job.last_error = (
            "; ".join(
                str(issue.get("errorCode") or issue.get("code") or issue)
                for issue in issues
                if isinstance(issue, dict)
            )
            or "Prodigi returned order issues."
        )


def apply_prodigi_items_to_local_items(order: OrdersOrm, order_data: dict[str, Any]) -> None:
    import logging

    _log = logging.getLogger(__name__)
    local_by_reference = {
        f"artshop-order-{order.id}-item-{item.id}": item for item in (order.items or [])
    }
    for remote_item in order_data.get("items") or []:
        if not isinstance(remote_item, dict):
            continue
        local_item = local_by_reference.get(str(remote_item.get("merchantReference") or ""))
        if local_item is None:
            continue
        _log.debug(
            "apply_prodigi_items: item type=%s, class=%s",
            type(local_item).__name__,
            type(local_item).__module__,
        )
        if remote_item.get("id"):
            _safe_set(local_item, "prodigi_order_item_id", str(remote_item["id"]))
        if remote_item.get("status"):
            _safe_set(local_item, "prodigi_status", str(remote_item["status"]))
        assets = [asset for asset in remote_item.get("assets") or [] if isinstance(asset, dict)]
        if assets and assets[0].get("id"):
            _safe_set(local_item, "prodigi_asset_id", str(assets[0]["id"]))


def _safe_set(obj: Any, attr: str, value: Any) -> None:
    """Set attribute on ORM or Pydantic model without raising for missing fields."""
    try:
        setattr(obj, attr, value)
    except (ValueError, AttributeError):
        pass


async def find_job_for_prodigi_order(
    db_session: Any,
    prodigi_order_id: str,
) -> ProdigiFulfillmentJobOrm | None:
    result = await db_session.execute(
        select(ProdigiFulfillmentJobOrm)
        .where(ProdigiFulfillmentJobOrm.prodigi_order_id == prodigi_order_id)
        .limit(1)
    )
    return result.scalar_one_or_none()


async def webhook_event_exists(db_session: Any, event_uid: str | None) -> bool:
    if not event_uid:
        return False
    result = await db_session.execute(
        select(ProdigiFulfillmentEventOrm.id)
        .where(ProdigiFulfillmentEventOrm.event_uid == event_uid)
        .limit(1)
    )
    return result.scalar_one_or_none() is not None


def format_item_status(stage: str, issues: list[dict[str, Any]]) -> str:
    if not issues:
        return stage
    first_issue = issues[0] if isinstance(issues[0], dict) else {}
    code = first_issue.get("errorCode") or first_issue.get("code") or "Issue"
    return f"{stage} - {code}"


async def persist_shipments(
    *,
    db_session: Any,
    job: ProdigiFulfillmentJobOrm | None,
    order: OrdersOrm | None,
    order_data: dict[str, Any],
) -> None:
    if job is None or order is None:
        return
    shipments = order_data.get("shipments") or []
    if not isinstance(shipments, list):
        return
    for shipment in shipments:
        if not isinstance(shipment, dict):
            continue
        external_id = (
            shipment.get("id") or shipment.get("shipmentId") or shipment.get("shipment_id")
        )
        if not external_id:
            external_id = f"{job.prodigi_order_id}:{len(str(shipment))}"
        tracking = _tracking_payload(shipment)
        existing = await _find_shipment(db_session, str(external_id))
        row = existing or ProdigiFulfillmentShipmentOrm(
            job_id=job.id,
            order_id=order.id,
            prodigi_order_id=job.prodigi_order_id,
            prodigi_shipment_id=str(external_id),
        )
        row.status = str(shipment.get("status") or shipment.get("stage") or "")
        row.carrier = tracking.get("carrier")
        row.tracking_number = tracking.get("tracking_number")
        row.tracking_url = tracking.get("tracking_url")
        row.payload = shipment
        if existing is None:
            db_session.add(row)
        _apply_first_tracking_to_order(order, tracking)


async def _find_shipment(db_session: Any, external_id: str) -> ProdigiFulfillmentShipmentOrm | None:
    result = await db_session.execute(
        select(ProdigiFulfillmentShipmentOrm)
        .where(ProdigiFulfillmentShipmentOrm.prodigi_shipment_id == external_id)
        .limit(1)
    )
    return result.scalar_one_or_none()


def _tracking_payload(shipment: dict[str, Any]) -> dict[str, str | None]:
    tracking = shipment.get("tracking") if isinstance(shipment.get("tracking"), dict) else {}
    tracking_number = (
        shipment.get("trackingNumber")
        or shipment.get("tracking_number")
        or shipment.get("trackingCode")
        or tracking.get("number")
    )
    carrier = (
        shipment.get("carrier")
        or shipment.get("courier")
        or shipment.get("service")
        or tracking.get("carrier")
    )
    tracking_url = (
        shipment.get("trackingUrl") or shipment.get("tracking_url") or tracking.get("url")
    )
    return {
        "tracking_number": str(tracking_number) if tracking_number else None,
        "carrier": str(carrier) if carrier else None,
        "tracking_url": str(tracking_url) if tracking_url else None,
    }


def _apply_first_tracking_to_order(order: OrdersOrm, tracking: dict[str, str | None]) -> None:
    if tracking.get("tracking_number") and not order.tracking_number:
        order.tracking_number = tracking["tracking_number"]
    if tracking.get("carrier") and not order.carrier:
        order.carrier = tracking["carrier"]
    if tracking.get("tracking_url") and not order.tracking_url:
        order.tracking_url = tracking["tracking_url"]
    if tracking.get("tracking_number") or tracking.get("carrier") or tracking.get("tracking_url"):
        order.fulfillment_status = "shipped"
