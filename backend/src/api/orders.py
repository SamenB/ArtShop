"""
API endpoints for managing artwork orders.
Includes order creation, tracking, and administrative management.
"""

from fastapi import APIRouter, Body
from sqlalchemy import select

from src.api.dependencies import AdminDep, DBDep, UserDep, UserDepOptional
from src.config import settings
from src.integrations.prodigi.fulfillment.gates import aggregate_gate_status
from src.integrations.prodigi.fulfillment.workflow import ProdigiFulfillmentWorkflow
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
    visible_gates = [gate for gate in gates if latest_job and gate.job_id == latest_job.id]
    if latest_job and not visible_gates:
        visible_gates = []
    elif not latest_job:
        visible_gates = gates
    visible_events = [event for event in events if latest_job and event.job_id == latest_job.id]
    if not latest_job:
        visible_events = events
    print_items = [item for item in (order.items or []) if item.prodigi_sku]
    preflight_status = _preflight_status(latest_job, visible_gates)
    can_submit = (
        order.payment_status in {"paid", "mock_paid"}
        and bool(print_items)
        and preflight_status == "passed"
    )

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
        "can_submit_manually": can_submit,
        "manual_submit_blocker": _manual_submit_blocker(order, print_items, preflight_status),
        "preflight_status": preflight_status,
        "latest_job_id": latest_job.id if latest_job else None,
        "summary": _build_prodigi_flow_summary(
            order, latest_job, print_items, visible_gates, visible_events
        ),
        "items": [_serialize_prodigi_item(item) for item in print_items],
        "jobs": [_serialize_job(job) for job in jobs],
        "gates": [_serialize_gate(gate) for gate in visible_gates],
        "events": [_serialize_event(event) for event in visible_events],
        "job_ids": job_ids,
    }


@router.post("/{order_id}/prodigi-preflight")
async def run_order_prodigi_preflight(order_id: int, admin_id: AdminDep, db: DBDep):
    order = await db.orders.get_one(id=order_id)
    await ProdigiFulfillmentWorkflow(db.session).run_preflight(order)
    return await get_order_prodigi_flow(order_id, admin_id, db)


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
    has_status_update = any(
        (
            event.event_type == "webhook"
            and event.stage not in {"received"}
            and event.status in {"passed", "issue"}
        )
        or (
            event.event_type == "api_response"
            and event.stage == "submit_order"
            and event.status == "passed"
            and latest_job is not None
            and bool(latest_job.status_stage)
        )
        for event in events
    )

    paid = order.payment_status in {"paid", "mock_paid"}
    has_prints = bool(print_items)
    submitted = latest_job is not None and latest_job.status in {
        "submitted",
        "in_progress",
        "on_hold",
        "issue",
        "complete",
    }
    failed = latest_job is not None and latest_job.status in {"failed", "blocked"}

    steps = [
        _flow_step_from_gates(
            key="payment_confirmed",
            label="Payment confirmed",
            purpose="Confirms the order is legally allowed to enter fulfillment.",
            gate_names=["payment_confirmed"],
            gates=gates,
            fallback_status="passed" if paid else "pending",
            fallback_detail=(
                "Monobank payment is confirmed." if paid else "Waiting for Monobank success."
            ),
            fallback_measured={"payment_status": order.payment_status},
            fallback_expected={"payment_status": ["paid", "mock_paid"]},
            next_action="Wait for payment callback or mark the test order as mock_paid.",
            timestamp=order.confirmed_at,
        ),
        _flow_step_from_gates(
            key="print_items_detected",
            label="Print items detected",
            purpose="Finds local order items that must be fulfilled through Prodigi.",
            gate_names=["print_items_detected"],
            gates=gates,
            fallback_status="passed" if has_prints else "skipped",
            fallback_detail=f"{len(print_items)} Prodigi-backed print item(s) in this order.",
            fallback_measured={"count": len(print_items)},
            fallback_expected={"count": ">=1"},
            next_action="Recreate the order with a Prodigi-backed print item.",
        ),
        _flow_step_from_gates(
            key="cost_covered",
            label="Cost covered",
            purpose="Blocks accidental loss-making fulfillment from persisted checkout economics.",
            gate_names=["cost_covered"],
            gates=gates,
            fallback_status="pending",
            fallback_detail="Run Refresh to compare paid total against Prodigi supplier cost.",
            fallback_measured=None,
            fallback_expected={"customer_paid": ">= supplier_total"},
            next_action="Fix storefront pricing, collect adjustment, or recreate the order.",
        ),
        _flow_step_from_gates(
            key="job_created",
            label="Fulfillment job created",
            purpose="Creates the durable local lifecycle record for this Prodigi submission attempt.",
            gate_names=["job_created"],
            gates=gates,
            fallback_status="passed"
            if latest_job
            else ("pending" if paid and has_prints else "skipped"),
            fallback_detail=(
                f"Job #{latest_job.id}, status {latest_job.status}."
                if latest_job
                else "No Prodigi job has been created yet."
            ),
            fallback_measured=(
                {
                    "job_id": latest_job.id,
                    "revision": latest_job.submission_revision,
                    "idempotency_key": latest_job.idempotency_key,
                }
                if latest_job
                else None
            ),
            fallback_expected={"job": "persisted"},
            next_action="Run Refresh to create a preflight job.",
            timestamp=latest_job.created_at if latest_job else None,
        ),
        _flow_step_from_gates(
            key="recipient_ready",
            label="Recipient ready",
            purpose="Validates the exact shipping identity and address fields Prodigi receives.",
            gate_names=["recipient_ready"],
            gates=gates,
            fallback_status="pending",
            fallback_detail="Run Refresh to validate recipient fields.",
            fallback_measured=None,
            fallback_expected={"address": "Prodigi required fields present"},
            next_action="Edit the order shipping address fields.",
        ),
        _flow_step_from_gates(
            key="storefront_rehydrated",
            label="Storefront rehydrated",
            purpose="Re-checks SKU, category, country, slot, attributes, shipping, and cost basis from the active bake.",
            gate_names=["storefront_rehydrated"],
            gates=gates,
            fallback_status="pending",
            fallback_detail="Run Refresh to rehydrate each item from the active Prodigi bake.",
            fallback_measured=None,
            fallback_expected={"source": "active_prodigi_storefront_bake"},
            next_action="Rebuild the active bake or recreate the order from current storefront offers.",
        ),
        _flow_step_from_gates(
            key="pixel_contract",
            label="Live pixel contract",
            purpose="Checks live Prodigi print-area pixels against our baked target within 2px.",
            gate_names=["live_prodigi_pixel_contract_verified", "live_prodigi_aspect_compatible"],
            gates=gates,
            fallback_status=gate_statuses.get("live_prodigi_pixel_contract_verified", "pending"),
            fallback_detail="Prodigi pixel dimensions checked against our baked target.",
            fallback_measured=None,
            fallback_expected={"allowed_drift_px": 2},
            next_action="Refresh the bake or inspect the SKU/Product Details response.",
        ),
        _flow_step_from_gates(
            key="quote_check",
            label="Prodigi quote check",
            purpose="Confirms Prodigi accepts SKU, attributes, print area, country, and shipping method before order creation.",
            gate_names=["prodigi_quote_check"],
            gates=gates,
            fallback_status="pending",
            fallback_detail="Run Refresh to call the Prodigi Quote endpoint.",
            fallback_measured=None,
            fallback_expected={"quote_outcome": "Created|Ok"},
            next_action="Fix SKU, attributes, destination country, or shipping method.",
        ),
        _flow_step_from_gates(
            key="asset_rendered",
            label="Order asset rendered",
            purpose="Renders the PNG that Prodigi will download and checks exact output pixels.",
            gate_names=["asset_rendered", "rendered_asset_pixel_match", "rendered_asset_md5_ready"],
            gates=gates,
            fallback_status=gate_statuses.get("rendered_asset_pixel_match", "pending"),
            fallback_detail="Rendered file is checked pixel-for-pixel before submit.",
            fallback_measured=None,
            fallback_expected={"format": "PNG", "pixels": "exact target"},
            next_action="Upload/fix the master asset or inspect render dimensions.",
        ),
        _flow_step_from_gates(
            key="asset_public_url",
            label="Asset public URL",
            purpose="Ensures Prodigi can download the rendered PNG through a public HTTPS URL.",
            gate_names=["public_asset_url_ready"],
            gates=gates,
            fallback_status="pending",
            fallback_detail="Run Refresh to verify the public asset URL and md5 hash.",
            fallback_measured=None,
            fallback_expected={"external_https": True, "md5": "present"},
            next_action=(
                "Configure PRINT_ASSET_STORAGE_BACKEND=s3_compatible with a public HTTPS "
                "asset base URL, or run from public HTTPS staging/production."
            ),
        ),
        _flow_step_from_gates(
            key="payload_valid",
            label="Payload valid",
            purpose="Builds and validates the exact order JSON that will be sent to Prodigi.",
            gate_names=["payload_valid"],
            gates=gates,
            fallback_status="pending",
            fallback_detail="Run Refresh to build the Prodigi payload preview.",
            fallback_measured=None,
            fallback_expected={"prodigi_order_payload": "valid"},
            next_action="Fix the failed measured field before submitting.",
        ),
    ]
    steps.extend(
        [
            {
                "key": "prodigi_submit",
                "label": "Submit to Prodigi",
                "purpose": "Creates the Prodigi order with POST /orders after preflight is green.",
                "status": "passed" if submitted else ("failed" if failed else "pending"),
                "detail": (
                    f"Prodigi order {latest_job.prodigi_order_id}."
                    if submitted
                    else latest_job.last_error
                    if failed
                    else "Not submitted yet."
                ),
                "expected": {
                    "prodigi_response_outcome": "Created|OnHold|CreatedWithIssues|AlreadyExists"
                },
                "measured": {
                    "prodigi_order_id": latest_job.prodigi_order_id if latest_job else None,
                    "job_status": latest_job.status if latest_job else None,
                    "last_error": latest_job.last_error if latest_job else None,
                },
                "error": latest_job.last_error if failed and latest_job else None,
                "next_action": "Fix red preflight gates, then submit again.",
                "timestamp": latest_job.updated_at if latest_job else None,
            },
            {
                "key": "prodigi_callback",
                "label": "Prodigi callback/status",
                "purpose": "Persists Prodigi webhook or immediate status-poll data after order creation.",
                "status": "passed" if has_status_update else "pending",
                "detail": (
                    f"Latest Prodigi stage: {latest_job.status_stage}."
                    if has_status_update and latest_job and latest_job.status_stage
                    else "Awaiting status updates from Prodigi after order creation."
                ),
                "expected": {"status_update": "webhook or GET /orders/{id} snapshot persisted"},
                "measured": {
                    "status_stage": latest_job.status_stage if latest_job else None,
                    "status_details": latest_job.status_details if latest_job else None,
                    "issues": latest_job.issues if latest_job else None,
                },
                "next_action": "Wait for webhook or poll Prodigi status.",
            },
        ]
    )
    return steps


def _preflight_status(
    latest_job: ProdigiFulfillmentJobOrm | None,
    gates: list[ProdigiFulfillmentGateResultOrm],
) -> str:
    if latest_job is None:
        return "pending"
    if latest_job.status == "preflight_passed":
        return "passed"
    if latest_job.status in {"blocked", "failed"}:
        return "failed"
    return aggregate_gate_status(gate.status for gate in gates)


def _manual_submit_blocker(order, print_items: list, preflight_status: str) -> str | None:
    if order.payment_status not in {"paid", "mock_paid"}:
        return "Payment must be confirmed before Prodigi submit."
    if not print_items:
        return "No Prodigi-backed print items were detected."
    if preflight_status != "passed":
        return "Run Refresh and fix every failed preflight gate before submitting."
    return None


def _flow_step_from_gates(
    *,
    key: str,
    label: str,
    purpose: str,
    gate_names: list[str],
    gates: list[ProdigiFulfillmentGateResultOrm],
    fallback_status: str,
    fallback_detail: str,
    fallback_measured,
    fallback_expected,
    next_action: str,
    timestamp=None,
) -> dict:
    matched = [gate for gate in gates if gate.gate in set(gate_names)]
    if not matched:
        return {
            "key": key,
            "label": label,
            "purpose": purpose,
            "status": fallback_status,
            "detail": fallback_detail,
            "expected": fallback_expected,
            "measured": fallback_measured,
            "error": None,
            "next_action": next_action if fallback_status != "passed" else None,
            "timestamp": timestamp,
        }

    status = aggregate_gate_status(gate.status for gate in matched)
    failed = [gate for gate in matched if gate.status in {"failed", "blocked"}]
    passed_count = sum(1 for gate in matched if gate.status in {"passed", "skipped"})
    first_error = next((gate.error for gate in failed if gate.error), None)
    if len(matched) == 1:
        measured = matched[0].measured
        expected = matched[0].expected
    else:
        measured = {
            "passed": passed_count,
            "total": len(matched),
            "gates": [
                {
                    "gate": gate.gate,
                    "status": gate.status,
                    "order_item_id": gate.order_item_id,
                    "measured": gate.measured,
                    "error": gate.error,
                }
                for gate in matched
            ],
        }
        expected = {
            "all_gates": "passed or skipped",
            "gates": [
                {"gate": gate.gate, "order_item_id": gate.order_item_id, "expected": gate.expected}
                for gate in matched
            ],
        }
    blocked_or_failed = status in {"failed", "blocked"}
    return {
        "key": key,
        "label": label,
        "purpose": purpose,
        "status": status,
        "detail": (
            f"{passed_count}/{len(matched)} check(s) passed."
            if not blocked_or_failed
            else first_error or f"{len(failed)} check(s) failed."
        ),
        "expected": expected,
        "measured": measured,
        "error": first_error,
        "next_action": next_action if status != "passed" else None,
        "timestamp": timestamp or max((gate.created_at for gate in matched), default=None),
    }


def _aggregate_status(statuses) -> str:
    return aggregate_gate_status(statuses)


def _float_or_none(value) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _resolve_prodigi_item_economics(item) -> dict:
    customer_line = _float_or_none(item.customer_line_total)
    if customer_line is None:
        customer_line = _float_or_none(item.price) or 0.0

    customer_product = _float_or_none(item.customer_product_price)
    if customer_product is None:
        customer_product = _float_or_none(item.prodigi_retail_eur)
    if customer_product is None:
        customer_product = customer_line

    customer_shipping = _float_or_none(item.customer_shipping_price)
    if customer_shipping is None:
        customer_shipping = max(customer_line - customer_product, 0.0)

    # Keep legacy rows mathematically readable even if only the integer line
    # total was stored before explicit customer delivery existed.
    if abs((customer_product + customer_shipping) - customer_line) > 0.01:
        customer_shipping = max(customer_line - customer_product, 0.0)

    supplier_product = _float_or_none(item.prodigi_wholesale_eur) or 0.0
    supplier_shipping = _float_or_none(item.prodigi_shipping_eur) or 0.0
    supplier_total = _float_or_none(item.prodigi_supplier_total_eur)
    if supplier_total is None:
        supplier_total = supplier_product + supplier_shipping

    return {
        "customer_product_price": customer_product,
        "customer_shipping_price": customer_shipping,
        "customer_line_total": customer_line,
        "customer_currency": item.customer_currency or "USD",
        "supplier_product_cost": supplier_product,
        "supplier_shipping_cost": supplier_shipping,
        "supplier_total_cost": supplier_total,
        "supplier_currency": item.prodigi_supplier_currency or "EUR",
        "storefront_bake_id": item.prodigi_storefront_bake_id,
        "storefront_policy_version": item.prodigi_storefront_policy_version,
        "selected_shipping_tier": item.prodigi_shipping_tier,
        "selected_shipping_method": item.prodigi_shipping_method,
        "selected_delivery_days": item.prodigi_delivery_days,
        "product_margin": customer_product - supplier_product,
        "shipping_margin": customer_shipping - supplier_shipping,
        "total_margin": customer_line - supplier_total,
    }


def _serialize_prodigi_item(item) -> dict:
    economics = _resolve_prodigi_item_economics(item)
    return {
        "id": item.id,
        "artwork_id": item.artwork_id,
        "title": getattr(getattr(item, "artwork", None), "title", None),
        "edition_type": item.edition_type,
        "finish": item.finish,
        "size": item.size,
        "price": item.price,
        "customer_product_price": economics["customer_product_price"],
        "customer_shipping_price": economics["customer_shipping_price"],
        "customer_line_total": economics["customer_line_total"],
        "customer_currency": economics["customer_currency"],
        "prodigi_storefront_offer_size_id": item.prodigi_storefront_offer_size_id,
        "prodigi_sku": item.prodigi_sku,
        "prodigi_category_id": item.prodigi_category_id,
        "prodigi_slot_size_label": item.prodigi_slot_size_label,
        "prodigi_attributes": item.prodigi_attributes,
        "prodigi_storefront_bake_id": item.prodigi_storefront_bake_id,
        "prodigi_storefront_policy_version": item.prodigi_storefront_policy_version,
        "prodigi_shipping_tier": item.prodigi_shipping_tier,
        "prodigi_shipping_method": item.prodigi_shipping_method,
        "prodigi_delivery_days": item.prodigi_delivery_days,
        "prodigi_order_id": item.prodigi_order_id,
        "prodigi_status": item.prodigi_status,
        "prodigi_wholesale_eur": item.prodigi_wholesale_eur,
        "prodigi_shipping_eur": item.prodigi_shipping_eur,
        "prodigi_supplier_total_eur": item.prodigi_supplier_total_eur,
        "prodigi_retail_eur": item.prodigi_retail_eur,
        "prodigi_supplier_currency": item.prodigi_supplier_currency,
        "prodigi_destination_country_code": item.prodigi_destination_country_code,
        "economics": economics,
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
        "status_stage": job.status_stage,
        "status_details": job.status_details,
        "issues": job.issues,
        "submitted_at": job.submitted_at,
        "submission_revision": job.submission_revision,
        "request_payload": job.request_payload,
        "response_payload": job.response_payload,
        "latest_status_payload": job.latest_status_payload,
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
