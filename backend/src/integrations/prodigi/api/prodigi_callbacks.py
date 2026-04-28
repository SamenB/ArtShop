import logging
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Request
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from src.api.dependencies import DBDep
from src.models.orders import OrderItemOrm, OrdersOrm

log = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/webhooks", tags=["Webhooks"])

@router.post("/prodigi")
async def prodigi_callback(request: Request, db: DBDep, background_tasks: BackgroundTasks):
    try:
        event = await request.json()
    except Exception as e:
        log.error(f"Invalid JSON payload for Prodigi webhook: {e}")
        return {"status": "error", "message": "invalid payload"}

    log.info(f"Received Prodigi webhook event: {event}")

    if not _is_order_event(event):
        return {"status": "ok"}

    order_data = _extract_order_data(event)
    ord_id = order_data.get("id")
    status_data = order_data.get("status", {})
    stage = status_data.get("stage") or _stage_from_event_type(event.get("type"))

    if not ord_id or not stage:
         log.error("Missing order id or stage in Prodigi webhook payload")
         return {"status": "error"}

    # Find matching OrderItem
    stmt = (
        select(OrderItemOrm)
        .where(OrderItemOrm.prodigi_order_id == ord_id)
        .options(selectinload(OrderItemOrm.order))
    )
    result = await db.session.execute(stmt)
    item = result.scalars().first()

    if not item:
        log.warning(f"Received Prodigi update for unknown order_id: {ord_id}")
        return {"status": "ok"}

    issues = status_data.get("issues") or []
    item.prodigi_status = _format_item_status(stage, issues)
    _apply_shipment_tracking(item.order, order_data)
    await db.commit()

    log.info(f"Updated OrderItem {item.id} prodigi_status to {item.prodigi_status}")

    return {"status": "ok"}


def _is_order_event(event: dict[str, Any]) -> bool:
    event_type = str(event.get("type") or "")
    return event_type == "OrderStatusChanged" or event_type.startswith("com.prodigi.order.")


def _extract_order_data(event: dict[str, Any]) -> dict[str, Any]:
    data = event.get("data") if isinstance(event.get("data"), dict) else {}
    for value in (data.get("order"), event.get("order"), data.get("resource"), event.get("resource")):
        if isinstance(value, dict):
            return value
    return {}


def _stage_from_event_type(event_type: Any) -> str | None:
    raw = str(event_type or "")
    if "#" not in raw:
        return None
    return raw.rsplit("#", 1)[-1] or None


def _format_item_status(stage: str, issues: list[dict[str, Any]]) -> str:
    if not issues:
        return stage
    first_issue = issues[0] if isinstance(issues[0], dict) else {}
    code = first_issue.get("errorCode") or first_issue.get("code") or "Issue"
    return f"{stage} - {code}"


def _apply_shipment_tracking(order: OrdersOrm | None, order_data: dict[str, Any]) -> None:
    if order is None:
        return
    shipments = order_data.get("shipments") or []
    if not isinstance(shipments, list) or not shipments:
        return
    shipment = next((item for item in shipments if isinstance(item, dict)), None)
    if shipment is None:
        return

    tracking_number = (
        shipment.get("trackingNumber")
        or shipment.get("tracking_number")
        or shipment.get("tracking")
        or shipment.get("trackingCode")
    )
    carrier = shipment.get("carrier") or shipment.get("courier") or shipment.get("service")
    tracking_url = shipment.get("trackingUrl") or shipment.get("tracking_url")

    if tracking_number:
        order.tracking_number = str(tracking_number)
    if carrier:
        order.carrier = str(carrier)
    if tracking_url:
        order.tracking_url = str(tracking_url)
    if tracking_number or carrier or tracking_url:
        order.fulfillment_status = "shipped"
