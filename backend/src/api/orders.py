"""
API endpoints for managing artwork orders.
Includes order creation, tracking, and administrative management.
"""

from fastapi import APIRouter, Body
from sqlalchemy import select

from src.api.dependencies import AdminDep, DBDep, UserDep, UserDepOptional
from src.config import settings
from src.models.prodigi_fulfillment import (
    ProdigiFulfillmentEventOrm,
    ProdigiFulfillmentGateResultOrm,
    ProdigiFulfillmentJobOrm,
)
from src.models.site_settings import SiteSettingsOrm
from src.schemas.orders import (
    FulfillmentStatusUpdate,
    OrderAddRequest,
    OrderBulkRequest,
    OrderPatch,
    OrderStatusUpdate,
)
from src.services.orders import OrderService

router = APIRouter(prefix="/orders", tags=["Orders"])


@router.get("")
async def get_all_orders(admin_id: AdminDep, db: DBDep):
    """
    Retrieves all orders in the system. Requires admin privileges.
    """
    return await OrderService(db).get_all_orders()


@router.get("/me")
async def get_my_orders(user_id: UserDep, db: DBDep):
    """
    Retrieves all orders belonging to the currently authenticated user.
    """
    return await OrderService(db).get_my_orders(user_id)


@router.get("/track")
async def track_orders_by_email(email: str, db: DBDep):
    """
    Public endpoint for order tracking by email address.
    Allows guests (non-authenticated) to look up their order status.
    Returns a sanitized list of orders associated with the provided email.
    """
    if not email or "@" not in email:
        return {"status": "OK", "data": []}
    orders = await OrderService(db).get_orders_by_email(email.strip().lower())
    # Return sanitized order data — only what the customer needs
    result = []
    for order in orders:
        result.append(
            {
                "id": order.id,
                "created_at": str(order.created_at) if order.created_at else None,
                "payment_status": order.payment_status,
                "fulfillment_status": order.fulfillment_status,
                "total_price": order.total_price,
                "first_name": order.first_name,
                "last_name": order.last_name,
                "shipping_city": order.shipping_city,
                "shipping_country": order.shipping_country,
                # Tracking info (visible when shipped)
                "tracking_number": order.tracking_number,
                "carrier": order.carrier,
                "tracking_url": order.tracking_url,
                # Lifecycle timestamps for progress bar
                "confirmed_at": str(order.confirmed_at) if order.confirmed_at else None,
                "print_ordered_at": str(order.print_ordered_at) if order.print_ordered_at else None,
                "shipped_at": str(order.shipped_at) if order.shipped_at else None,
                "delivered_at": str(order.delivered_at) if order.delivered_at else None,
                "items": [
                    {
                        "artwork_id": item.artwork_id,
                        "edition_type": item.edition_type,
                        "finish": item.finish,
                        "size": item.size,
                        "price": item.price,
                    }
                    for item in (order.items or [])
                ],
            }
        )
    return {"status": "OK", "data": result}


@router.post("")
async def create_order(
    db: DBDep,
    order_data: OrderAddRequest,
    user_id: UserDepOptional = None,
):
    """
    Creates a new order. Optionally associates the order with a user ID if authenticated.
    """
    order = await OrderService(db).create_order(order_data, user_id)
    return {"status": "OK", "data": order}


@router.post("/bulk")
async def create_orders_bulk(db: DBDep, orders_data: list[OrderBulkRequest] = Body()):
    """
    Creates multiple orders in a single request. Primarily used for data migration or testing.
    """
    result = await OrderService(db).create_orders_bulk(orders_data)
    return {"status": "OK", "data": result}


@router.get("/timeline")
async def get_orders_timeline(admin_id: AdminDep, db: DBDep):
    """
    Retrieves a timeline view of all orders. Requires admin privileges.
    """
    return await OrderService(db).get_orders_timeline()


@router.get("/prodigi/fulfillment-mode")
async def get_prodigi_fulfillment_mode(admin_id: AdminDep, db: DBDep):
    settings_obj = await _get_or_create_settings(db)
    return {
        "mode": settings_obj.prodigi_fulfillment_mode,
        "prodigi_api_mode": "sandbox" if settings.PRODIGI_SANDBOX else "live",
        "auto_submit_enabled": settings_obj.prodigi_fulfillment_mode == "automatic",
    }


@router.put("/prodigi/fulfillment-mode")
async def update_prodigi_fulfillment_mode(
    admin_id: AdminDep,
    db: DBDep,
    mode: str = Body(..., embed=True),
):
    if mode not in {"automatic", "manual"}:
        return {"status": "error", "message": "mode must be automatic or manual"}
    settings_obj = await _get_or_create_settings(db)
    settings_obj.prodigi_fulfillment_mode = mode
    await db.commit()
    return {
        "status": "OK",
        "mode": mode,
        "auto_submit_enabled": mode == "automatic",
    }


@router.get("/{order_id}/prodigi-flow")
async def get_order_prodigi_flow(order_id: int, admin_id: AdminDep, db: DBDep):
    order = await db.orders.get_one(id=order_id)
    settings_obj = await _get_or_create_settings(db)
    jobs = list(
        (
            await db.session.execute(
                select(ProdigiFulfillmentJobOrm)
                .where(ProdigiFulfillmentJobOrm.order_id == order_id)
                .order_by(ProdigiFulfillmentJobOrm.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    job_ids = [job.id for job in jobs]
    gates = list(
        (
            await db.session.execute(
                select(ProdigiFulfillmentGateResultOrm)
                .where(ProdigiFulfillmentGateResultOrm.order_id == order_id)
                .order_by(ProdigiFulfillmentGateResultOrm.created_at.asc())
            )
        )
        .scalars()
        .all()
    )
    events = list(
        (
            await db.session.execute(
                select(ProdigiFulfillmentEventOrm)
                .where(ProdigiFulfillmentEventOrm.order_id == order_id)
                .order_by(ProdigiFulfillmentEventOrm.created_at.asc())
            )
        )
        .scalars()
        .all()
    )
    latest_job = jobs[0] if jobs else None
    print_items = [item for item in (order.items or []) if item.prodigi_sku]

    return {
        "order": {
            "id": order.id,
            "payment_status": order.payment_status,
            "fulfillment_status": order.fulfillment_status,
            "confirmed_at": order.confirmed_at,
            "created_at": order.created_at,
        },
        "settings": {
            "fulfillment_mode": settings_obj.prodigi_fulfillment_mode,
            "prodigi_api_mode": "sandbox" if settings.PRODIGI_SANDBOX else "live",
            "webhook_secret_configured": bool(settings.PRODIGI_WEBHOOK_SECRET),
            "public_base_url": settings.PUBLIC_BASE_URL,
        },
        "can_submit_manually": order.payment_status in {"paid", "mock_paid"} and bool(print_items),
        "latest_job_id": latest_job.id if latest_job else None,
        "summary": _build_prodigi_flow_summary(order, latest_job, print_items, gates, events),
        "items": [_serialize_prodigi_item(item) for item in print_items],
        "jobs": [_serialize_job(job) for job in jobs],
        "gates": [_serialize_gate(gate) for gate in gates],
        "events": [_serialize_event(event) for event in events],
        "job_ids": job_ids,
    }


@router.post("/{order_id}/prodigi-submit")
async def submit_order_to_prodigi(order_id: int, admin_id: AdminDep, db: DBDep):
    await OrderService(db).submit_order_to_print_provider(order_id)
    return await get_order_prodigi_flow(order_id, admin_id, db)


@router.put("/{order_id}/status")
async def update_order_status(
    order_id: int, admin_id: AdminDep, db: DBDep, status_data: OrderStatusUpdate
):
    """
    Updates the payment status of a specific order. Requires admin privileges.
    """
    await OrderService(db).update_payment_status(order_id, status_data.payment_status)
    return {"status": "OK"}


@router.patch("/{order_id}/fulfillment")
async def update_order_fulfillment(
    order_id: int,
    admin_id: AdminDep,
    db: DBDep,
    fulfillment_data: FulfillmentStatusUpdate,
):
    """
    Updates the fulfillment status of a specific order. Requires admin privileges.

    Side effects:
    - Auto-sets the corresponding lifecycle timestamp (e.g., shipped_at).
    - Auto-generates tracking_url from carrier template when tracking_number is provided.
    - Sends a transactional email to the customer notifying them of the status change.

    Body example (shipping):
        {
            "fulfillment_status": "shipped",
            "tracking_number": "20450000000001",
            "carrier": "nova_poshta",
            "notes": "Packed with bubble wrap, fragile sticker attached"
        }
    """
    await OrderService(db).update_fulfillment_status(order_id, fulfillment_data)
    return {"status": "OK"}


@router.patch("/{order_id}")
async def patch_order(order_id: int, admin_id: AdminDep, db: DBDep, order_patch: OrderPatch):
    """
    Applies partial updates to a specific order. Requires admin privileges.
    """
    await OrderService(db).patch_order(order_id, order_patch)
    return {"status": "OK"}


@router.delete("/{order_id}")
async def delete_order(order_id: int, admin_id: AdminDep, db: DBDep):
    """
    Permanently deletes a specific order record. Requires admin privileges.
    """
    await OrderService(db).delete_order(order_id)
    return {"status": "OK"}


async def _get_or_create_settings(db: DBDep) -> SiteSettingsOrm:
    settings_obj = await db.session.get(SiteSettingsOrm, 1)
    if not settings_obj:
        settings_obj = SiteSettingsOrm(id=1)
        db.session.add(settings_obj)
        await db.commit()
        await db.session.refresh(settings_obj)
    return settings_obj


def _build_prodigi_flow_summary(
    order,
    latest_job: ProdigiFulfillmentJobOrm | None,
    print_items: list,
    gates: list[ProdigiFulfillmentGateResultOrm],
    events: list[ProdigiFulfillmentEventOrm],
) -> list[dict]:
    gate_statuses = {gate.gate: gate.status for gate in gates}
    event_keys = {(event.event_type, event.stage): event.status for event in events}

    paid = order.payment_status in {"paid", "mock_paid"}
    has_prints = bool(print_items)
    submitted = latest_job is not None and latest_job.status == "submitted"
    failed = latest_job is not None and latest_job.status in {"failed", "blocked"}

    return [
        {
            "key": "payment_confirmed",
            "label": "Payment confirmed",
            "status": "passed" if paid else "pending",
            "detail": "Monobank payment is confirmed." if paid else "Waiting for Monobank success.",
            "timestamp": order.confirmed_at,
        },
        {
            "key": "print_items_detected",
            "label": "Print items detected",
            "status": "passed" if has_prints else "skipped",
            "detail": f"{len(print_items)} Prodigi-backed print item(s) in this order.",
        },
        {
            "key": "job_created",
            "label": "Fulfillment job created",
            "status": "passed" if latest_job else ("pending" if paid and has_prints else "skipped"),
            "detail": (
                f"Job #{latest_job.id}, status {latest_job.status}."
                if latest_job
                else "No Prodigi job has been created yet."
            ),
            "timestamp": latest_job.created_at if latest_job else None,
        },
        {
            "key": "quality_gates",
            "label": "Quality gates",
            "status": _aggregate_status(gate.status for gate in gates),
            "detail": f"{sum(1 for gate in gates if gate.status == 'passed')}/{len(gates)} gates passed.",
        },
        {
            "key": "pixel_contract",
            "label": "Live pixel contract",
            "status": gate_statuses.get("live_prodigi_pixel_contract_verified", "pending"),
            "detail": "Prodigi pixel dimensions checked against our baked target.",
        },
        {
            "key": "asset_rendered",
            "label": "Order asset rendered",
            "status": gate_statuses.get("rendered_asset_pixel_match", "pending"),
            "detail": "Rendered file is checked pixel-for-pixel before submit.",
        },
        {
            "key": "prodigi_submit",
            "label": "Submit to Prodigi",
            "status": "passed" if submitted else ("failed" if failed else "pending"),
            "detail": (
                f"Prodigi order {latest_job.prodigi_order_id}."
                if submitted
                else latest_job.last_error
                if failed
                else "Not submitted yet."
            ),
            "timestamp": latest_job.updated_at if latest_job else None,
        },
        {
            "key": "prodigi_callback",
            "label": "Prodigi callback/status",
            "status": event_keys.get(("webhook", "prodigi_callback"), "pending"),
            "detail": "Awaiting status updates from Prodigi after order creation.",
        },
    ]


def _aggregate_status(statuses) -> str:
    values = list(statuses)
    if not values:
        return "pending"
    if any(status == "failed" for status in values):
        return "failed"
    if all(status == "passed" for status in values):
        return "passed"
    return "pending"


def _serialize_prodigi_item(item) -> dict:
    return {
        "id": item.id,
        "artwork_id": item.artwork_id,
        "title": getattr(getattr(item, "artwork", None), "title", None),
        "edition_type": item.edition_type,
        "finish": item.finish,
        "size": item.size,
        "price": item.price,
        "prodigi_storefront_offer_size_id": item.prodigi_storefront_offer_size_id,
        "prodigi_sku": item.prodigi_sku,
        "prodigi_category_id": item.prodigi_category_id,
        "prodigi_slot_size_label": item.prodigi_slot_size_label,
        "prodigi_attributes": item.prodigi_attributes,
        "prodigi_shipping_method": item.prodigi_shipping_method,
        "prodigi_order_id": item.prodigi_order_id,
        "prodigi_status": item.prodigi_status,
        "prodigi_wholesale_eur": item.prodigi_wholesale_eur,
        "prodigi_shipping_eur": item.prodigi_shipping_eur,
        "prodigi_retail_eur": item.prodigi_retail_eur,
        "prodigi_destination_country_code": item.prodigi_destination_country_code,
    }


def _serialize_job(job: ProdigiFulfillmentJobOrm) -> dict:
    return {
        "id": job.id,
        "status": job.status,
        "mode": job.mode,
        "merchant_reference": job.merchant_reference,
        "idempotency_key": job.idempotency_key,
        "prodigi_order_id": job.prodigi_order_id,
        "attempt_count": job.attempt_count,
        "payload_hash": job.payload_hash,
        "last_error": job.last_error,
        "created_at": job.created_at,
        "updated_at": job.updated_at,
    }


def _serialize_gate(gate: ProdigiFulfillmentGateResultOrm) -> dict:
    return {
        "id": gate.id,
        "job_id": gate.job_id,
        "order_item_id": gate.order_item_id,
        "gate": gate.gate,
        "status": gate.status,
        "measured": gate.measured,
        "expected": gate.expected,
        "error": gate.error,
        "created_at": gate.created_at,
    }


def _serialize_event(event: ProdigiFulfillmentEventOrm) -> dict:
    return {
        "id": event.id,
        "job_id": event.job_id,
        "order_item_id": event.order_item_id,
        "event_type": event.event_type,
        "stage": event.stage,
        "status": event.status,
        "external_id": event.external_id,
        "request_payload": event.request_payload,
        "response_payload": event.response_payload,
        "metadata": event.metadata_json,
        "error": event.error,
        "created_at": event.created_at,
    }
