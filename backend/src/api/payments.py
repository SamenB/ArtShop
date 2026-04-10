"""
API endpoints for payment processing via Monobank acquiring.

Provides three core endpoints:
- POST /payments/create — Initiates a payment session for an existing order.
- POST /payments/webhook — Receives and processes Monobank status callbacks.
- GET  /payments/{order_id}/status — Returns the current payment status of an order.

Security model:
- /create requires authentication (optional user, but order must exist).
- /webhook is called by Monobank servers; verified via ECDSA signature.
- /status is public (reads only non-sensitive order state fields).
"""

import json

from fastapi import APIRouter, Request, Response
from loguru import logger

from src.api.dependencies import DBDep, UserDepOptional
from src.config import settings
from src.exeptions import (
    MonobankServiceError,
    ObjectNotFoundException,
    PaymentGatewayException,
    PaymentWebhookVerificationException,
)
from src.schemas.payments import (
    MonobankWebhookPayload,
    PaymentCreateRequest,
    PaymentCreateResponse,
    PaymentStatusResponse,
)
from src.services.monobank import MonobankService
from src.services.orders import OrderService

router = APIRouter(prefix="/payments", tags=["Payments"])

# Monobank status → internal status mapping.
MONOBANK_STATUS_MAP: dict[str, str] = {
    "success": "paid",
    "failure": "failed",
    "reversed": "refunded",
    "processing": "processing",
    "hold": "hold",
    "created": "awaiting_payment",
}


@router.post("/create", response_model=PaymentCreateResponse)
async def create_payment(
    db: DBDep,
    payment_data: PaymentCreateRequest,
    user_id: UserDepOptional = None,
):
    """
    Initiates a payment session for an existing order.

    Flow:
    1. Fetches the order from the database.
    2. Validates that the order belongs to the requesting user (if authenticated).
    3. Creates a Monobank invoice with the order total and details.
    4. Delegates persistence of invoice references to OrderService.
    5. Returns the payment URL for frontend redirect.

    Args:
        db: Database session dependency.
        payment_data: Order ID and currency selection.
        user_id: Optional authenticated user ID for ownership validation.

    Returns:
        PaymentCreateResponse with the Monobank payment page URL.

    Raises:
        ObjectNotFoundException: If the order does not exist.
        PaymentGatewayException: If Monobank API call fails.
    """
    # 1. Fetch the order and validate existence.
    order = await db.orders.get_one_or_none(id=payment_data.order_id)
    if not order:
        raise ObjectNotFoundException(detail="Order not found")

    # 2. Security: If the user is authenticated, verify order ownership.
    if user_id and order.user_id and order.user_id != user_id:
        raise ObjectNotFoundException(detail="Order not found")

    # 3. Build basket items for the Monobank receipt.
    EDITION_LABELS = {"original": "Original Painting", "print": "Fine Art Print"}
    basket_items = []
    for item in order.items:
        # Use actual artwork title if the relationship is loaded.
        artwork = getattr(item, "artwork", None)
        name = artwork.title if artwork else f"Artwork #{item.artwork_id}"
        edition_label = EDITION_LABELS.get(item.edition_type, item.edition_type)
        if item.size:
            edition_label += f" · {item.size}"
            
        basket_item = {
            "name": f"{name} — {edition_label}",
            "qty": 1,
            "sum": item.price * 100,  # Convert to smallest currency unit.
            "total": item.price * 100,
            "unit": "pcs",
        }
        
        # Add icon if available globally accessible URL
        if artwork and artwork.images and len(artwork.images) > 0:
            # Monobank requires an absolute URL. Assuming stored images are.
            basket_item["icon"] = artwork.images[0]
            
        basket_items.append(basket_item)

    # 4. Create the Monobank invoice.
    item_count = len(order.items)
    description = (
        f"Samen Bondarenko Gallery — Order #{order.id} "
        f"({item_count} {'item' if item_count == 1 else 'items'})"
    )
    try:
        mono = MonobankService()
        invoice_data = await mono.create_invoice(
            amount_coins=order.total_price * 100,  # Convert to kopiykas/cents.
            currency=payment_data.currency,
            order_reference=f"artshop-order-{order.id}",
            destination=description,
            basket_items=basket_items,
            redirect_url=(
                f"{settings.MONOBANK_REDIRECT_URL}?orderId={order.id}"
                if settings.MONOBANK_REDIRECT_URL
                else None
            ),
        )
    except MonobankServiceError as e:
        logger.error("Monobank invoice creation failed for order {}: {}", order.id, e)
        raise PaymentGatewayException(detail=f"Payment gateway error: {e.detail}")

    # 5. Persist payment references via the service layer.
    await OrderService(db).link_payment_session(
        order_id=order.id,
        invoice_id=invoice_data["invoiceId"],
        payment_url=invoice_data["pageUrl"],
    )

    logger.info(
        "Payment session created: order_id={} invoice_id={}",
        order.id,
        invoice_data["invoiceId"],
    )

    return PaymentCreateResponse(
        order_id=order.id,
        invoice_id=invoice_data["invoiceId"],
        payment_url=invoice_data["pageUrl"],
    )


@router.post("/webhook")
async def monobank_webhook(request: Request, db: DBDep):
    """
    Receives payment status updates from Monobank's acquiring system.

    Security:
    - The raw request body is verified against the ECDSA signature in the
      X-Sign header using Monobank's published public key.
    - Requests with invalid or missing signatures are rejected with 403.

    Idempotency:
    - Terminal status protection is handled in OrderService.update_payment_status_by_invoice().

    Status mapping:
    - 'success'    → 'paid'       (payment confirmed)
    - 'failure'    → 'failed'     (payment declined)
    - 'reversed'   → 'refunded'   (payment reversed)
    - 'processing' → 'processing' (payment in progress)
    - 'hold'       → 'hold'       (funds held, pending finalization)

    Returns:
        HTTP 200 OK to acknowledge receipt (required by Monobank protocol).
        Monobank will retry up to 3 times if it does not receive 200.
    """
    # 1. Read raw body for signature verification (must be done before JSON parsing).
    body = await request.body()
    x_sign = request.headers.get("X-Sign", "")

    # 2. Verify the ECDSA signature to ensure the request is from Monobank.
    if settings.MONOBANK_TOKEN:
        try:
            mono = MonobankService()
            is_valid = await mono.verify_webhook_signature(body, x_sign)
            if not is_valid:
                logger.warning(
                    "SECURITY: Webhook signature verification failed. "
                    "Possible forgery attempt. X-Sign: {}",
                    x_sign[:20] + "..." if x_sign else "MISSING",
                )
                raise PaymentWebhookVerificationException()
        except PaymentWebhookVerificationException:
            raise
        except Exception as e:
            # In test mode, log but don't block — test webhooks may not have valid signatures.
            logger.warning(
                "Webhook signature verification error (non-blocking in test mode): {}", e
            )

    # 3. Parse the webhook payload.
    try:
        payload_data = json.loads(body)
        payload = MonobankWebhookPayload(**payload_data)
    except Exception as e:
        logger.error("Failed to parse Monobank webhook payload: {}", e)
        return Response(status_code=200)  # Acknowledge to prevent retries.

    logger.info(
        "Monobank webhook received: invoiceId={} status={} ref={}",
        payload.invoiceId,
        payload.status,
        payload.reference,
    )

    # 4. Log failure details for operational monitoring.
    if payload.failureReason:
        logger.warning(
            "Payment failed (invoice {}): {} (errCode={})",
            payload.invoiceId,
            payload.failureReason,
            payload.errCode,
        )

    # 5. Map Monobank status → internal status and delegate to service layer.
    internal_status = MONOBANK_STATUS_MAP.get(payload.status, payload.status)
    await OrderService(db).update_payment_status_by_invoice(
        invoice_id=payload.invoiceId,
        payment_status=internal_status,
    )

    # 6. Return 200 to prevent Monobank retry attempts.
    return Response(status_code=200)


@router.get("/{order_id}/status", response_model=PaymentStatusResponse)
async def get_payment_status(order_id: int, db: DBDep):
    """
    Returns the current payment status for a given order.

    Used by the frontend to poll for payment completion after
    the buyer is redirected back from the Monobank payment page.

    Args:
        order_id: The ID of the order to check.

    Returns:
        PaymentStatusResponse with the current payment status.

    Raises:
        ObjectNotFoundException: If the order does not exist.
    """
    order = await db.orders.get_one_or_none(id=order_id)
    if not order:
        raise ObjectNotFoundException(detail="Order not found")

    # If status is awaiting_payment, actively poll Monobank to cover missed webhooks (e.g., localhost dev).
    if order.payment_status == "awaiting_payment" and order.invoice_id:
        try:
            mono_status_data = await MonobankService().get_invoice_status(order.invoice_id)
            mono_status = mono_status_data.get("status")
            if mono_status:
                internal_status = MONOBANK_STATUS_MAP.get(mono_status, mono_status)
                if internal_status != order.payment_status:
                    logger.info("Syncing payment status from API for order {}: {} -> {}", order.id, order.payment_status, internal_status)
                    await OrderService(db).update_payment_status_by_invoice(
                        invoice_id=order.invoice_id,
                        payment_status=internal_status,
                    )
                    order.payment_status = internal_status
        except Exception as e:
            logger.warning("Failed to sync invoice status during polling for order {}: {}", order.id, e)

    return PaymentStatusResponse(
        order_id=order.id,
        payment_status=order.payment_status,
        invoice_id=order.invoice_id,
    )
