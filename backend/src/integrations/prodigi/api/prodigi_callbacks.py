import logging
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Request
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from src.api.dependencies import DBDep
from src.config import settings
from src.integrations.prodigi.fulfillment.status import (
    apply_order_status_to_job,
    apply_prodigi_items_to_local_items,
    extract_order_data,
    extract_stage,
    find_job_for_prodigi_order,
    format_item_status,
    persist_shipments,
    webhook_event_exists,
)
from src.models.orders import OrderItemOrm, OrdersOrm
from src.models.prodigi_fulfillment import ProdigiFulfillmentEventOrm

log = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/webhooks", tags=["Webhooks"])


@router.post("/prodigi")
async def prodigi_callback(request: Request, db: DBDep, background_tasks: BackgroundTasks):
    if settings.PRODIGI_WEBHOOK_SECRET:
        supplied = request.query_params.get("token") or request.headers.get(
            "X-Prodigi-Webhook-Secret"
        )
        if supplied != settings.PRODIGI_WEBHOOK_SECRET:
            log.warning("Rejected Prodigi webhook with invalid or missing shared secret.")
            return {"status": "error", "message": "invalid webhook secret"}

    try:
        event = await request.json()
    except Exception as e:
        log.error(f"Invalid JSON payload for Prodigi webhook: {e}")
        return {"status": "error", "message": "invalid payload"}

    log.info(f"Received Prodigi webhook event: {event}")
    event_uid = str(event.get("id") or "") or None
    if await webhook_event_exists(db.session, event_uid):
        log.info("Skipping duplicate Prodigi webhook event: %s", event_uid)
        return {"status": "ok", "duplicate": True}

    db.session.add(
        ProdigiFulfillmentEventOrm(
            order_id=None,
            event_uid=event_uid,
            event_type="webhook",
            stage="received",
            status="received",
            response_payload=event,
            metadata_json={"source": "prodigi"},
        )
    )

    if not _is_order_event(event):
        await db.commit()
        return {"status": "ok"}

    order_data = extract_order_data(event)
    ord_id = order_data.get("id") or event.get("subject")
    status_data = order_data.get("status") if isinstance(order_data.get("status"), dict) else {}
    stage = extract_stage(event, order_data)

    if not ord_id or not stage:
        log.error("Missing order id or stage in Prodigi webhook payload")
        await db.commit()
        return {"status": "error"}

    job = await find_job_for_prodigi_order(db.session, str(ord_id))

    # Find matching OrderItem
    stmt = (
        select(OrderItemOrm)
        .where(OrderItemOrm.prodigi_order_id == ord_id)
        .options(selectinload(OrderItemOrm.order))
    )
    result = await db.session.execute(stmt)
    item = result.scalars().first()

    order = item.order if item else await _load_job_order(db.session, job)

    if not item and order is None:
        log.warning(f"Received Prodigi update for unknown order_id: {ord_id}")
        db.session.add(
            ProdigiFulfillmentEventOrm(
                job_id=getattr(job, "id", None),
                event_uid=None,
                event_type="webhook",
                stage=stage,
                status="unknown_external_order",
                external_id=ord_id,
                response_payload=event,
            )
        )
        await db.commit()
        return {"status": "ok"}

    issues = status_data.get("issues") or []
    if item is not None:
        item.prodigi_status = format_item_status(stage, issues)
    if job is not None:
        apply_order_status_to_job(job=job, order_data=order_data, response_payload=event)
    if order is not None:
        apply_prodigi_items_to_local_items(order, order_data)
        await persist_shipments(
            db_session=db.session,
            job=job,
            order=order,
            order_data=order_data,
        )
    db.session.add(
        ProdigiFulfillmentEventOrm(
            job_id=getattr(job, "id", None),
            order_id=getattr(order, "id", None),
            order_item_id=getattr(item, "id", None),
            user_id=getattr(order, "user_id", None),
            event_type="webhook",
            stage=stage,
            status="passed" if not issues else "issue",
            external_id=ord_id,
            event_uid=None,
            response_payload=event,
            metadata_json={
                "prodigi_status": getattr(item, "prodigi_status", None),
                "issues": issues,
                "tracking_number": getattr(order, "tracking_number", None),
                "carrier": getattr(order, "carrier", None),
                "tracking_url": getattr(order, "tracking_url", None),
            },
        )
    )
    await db.commit()

    log.info("Processed Prodigi webhook for order_id=%s stage=%s", ord_id, stage)

    return {"status": "ok"}


def _is_order_event(event: dict[str, Any]) -> bool:
    event_type = str(event.get("type") or "")
    return (
        event_type == "OrderStatusChanged"
        or event_type.startswith("com.prodigi.order.")
        or bool(extract_order_data(event).get("id"))
    )


async def _load_job_order(db_session, job) -> OrdersOrm | None:
    if job is None:
        return None
    result = await db_session.execute(
        select(OrdersOrm)
        .where(OrdersOrm.id == job.order_id)
        .options(selectinload(OrdersOrm.items))
        .limit(1)
    )
    return result.scalar_one_or_none()
