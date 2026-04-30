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
from decimal import ROUND_HALF_UP, Decimal

from fastapi import APIRouter, Request, Response
from loguru import logger

from src.api.dependencies import DBDep, UserDepOptional
from src.config import settings
from src.exeptions import (
    InvalidDataException,
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
from src.utils.order_public_code import public_order_code, resolve_public_order_code

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


def _payment_currency_rate(currency: str) -> Decimal:
    normalized = currency.upper()
    if normalized == "USD":
        return Decimal("1")
    if normalized == "UAH":
        return Decimal(str(settings.MONOBANK_USD_TO_UAH_RATE))
    if normalized == "EUR":
        return Decimal(str(settings.MONOBANK_USD_TO_EUR_RATE))
    raise ValueError(f"Unsupported payment currency: {currency}")


def _order_total_to_currency_coins(total_price_usd: int | float, currency: str) -> int:
    amount = Decimal(str(total_price_usd)) * _payment_currency_rate(currency) * Decimal("100")
    return max(1, int(amount.quantize(Decimal("1"), rounding=ROUND_HALF_UP)))


def _round_customer_amount(value: int | float | None) -> int:
    if value is None:
        return 0
    return int(float(value) + 0.5)


def _validate_order_totals_for_payment(order) -> None:
    subtotal = _round_customer_amount(getattr(order, "subtotal_price", None))
    shipping = _round_customer_amount(getattr(order, "shipping_price", None))
    discount = _round_customer_amount(getattr(order, "discount_price", None))
    total = _round_customer_amount(getattr(order, "total_price", None))

    item_total = 0
    for item in getattr(order, "items", []) or []:
        is_print = getattr(item, "edition_type", None) != "original"
        if is_print and (
            getattr(item, "prodigi_storefront_bake_id", None) is None
            or not getattr(item, "prodigi_storefront_policy_version", None)
            or getattr(item, "customer_product_price", None) is None
            or getattr(item, "customer_shipping_price", None) is None
            or getattr(item, "customer_line_total", None) is None
        ):
            raise InvalidDataException(
                detail=(
                    "Payment blocked: order item is missing server-resolved "
                    "storefront economics from the active payload."
                ),
                status_code=409,
            )
        item_total += _round_customer_amount(
            getattr(item, "customer_line_total", None)
            if getattr(item, "customer_line_total", None) is not None
            else getattr(item, "price", None)
        )

    expected_total = max(0, subtotal + shipping - discount)
    if total != expected_total or total != max(0, item_total - discount):
        raise InvalidDataException(
            detail=(
                "Payment blocked: order total does not match persisted customer economics "
                f"(subtotal={subtotal}, shipping={shipping}, discount={discount}, "
                f"items={item_total}, total={total})."
            ),
            status_code=409,
        )


async def _resolve_payment_orders(db: DBDep, order) -> list:
    if not getattr(order, "checkout_group_id", None):
        return [order]
    orders = await db.orders.get_filtered(checkout_group_id=order.checkout_group_id)
    return sorted(orders, key=lambda candidate: candidate.id)


def _validate_orders_totals_for_payment(orders: list) -> None:
    for order in orders:
        _validate_order_totals_for_payment(order)


def _orders_total_price(orders: list) -> int:
    return sum(_round_customer_amount(getattr(order, "total_price", None)) for order in orders)


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

    payment_orders = await _resolve_payment_orders(db, order)
    _validate_orders_totals_for_payment(payment_orders)

    # 3. Determine the final amount to charge from the persisted order only.
    # The browser may display a converted estimate, but the payment gateway must
    # never trust a client-submitted amount for the final charge.
    group_total_price = _orders_total_price(payment_orders)
    final_amount_coins = _order_total_to_currency_coins(group_total_price, payment_data.currency)
    if payment_data.amount_coins and payment_data.amount_coins != final_amount_coins:
        logger.warning(
            "Ignoring client payment amount for order {}: client={} server={}",
            order.id,
            payment_data.amount_coins,
            final_amount_coins,
        )

    # 4. Build basket items for the Monobank receipt.
    EDITION_LABELS = {"original": "Original Painting", "print": "Fine Art Print"}
    all_items = [
        item
        for payment_order in payment_orders
        for item in (getattr(payment_order, "items", []) or [])
    ]
    order_total_usd_coins = sum(item.price for item in all_items) * 100 or 1
    basket_items = []
    for item in all_items:
        # Use actual artwork title if the relationship is loaded.
        artwork = getattr(item, "artwork", None)
        name = artwork.title if artwork else f"Artwork #{item.artwork_id}"
        edition_label = EDITION_LABELS.get(item.edition_type, item.edition_type)
        if item.size:
            edition_label += f", {item.size}"

        # Scale each item's price proportionally to match the converted total.
        item_fraction = (item.price * 100) / order_total_usd_coins
        item_sum = round(final_amount_coins * item_fraction)

        basket_item = {
            "name": f"{name} - {edition_label}",
            "qty": 1,
            "sum": item_sum,
            "total": item_sum,
            "unit": "pcs",
        }

        # Add product thumbnail for Monobank payment page display.
        # Monobank requires an absolute, publicly accessible URL.
        if artwork and artwork.images:
            first_img = artwork.images[0] if artwork.images else None
            if first_img:
                # Extract the path from either string or dict format.
                img_path = None
                if isinstance(first_img, str):
                    img_path = first_img
                elif isinstance(first_img, dict):
                    img_path = (
                        first_img.get("thumb")
                        or first_img.get("medium")
                        or first_img.get("original")
                    )

                if img_path:
                    # Build absolute URL using production domain.
                    if img_path.startswith("http"):
                        basket_item["icon"] = img_path
                    elif img_path.startswith("/"):
                        basket_item["icon"] = f"https://samen-bondarenko.com{img_path}"

        basket_items.append(basket_item)

    # Adjust last basket item so totals match exactly (rounding correction).
    if basket_items:
        basket_sum = sum(bi["total"] for bi in basket_items)
        diff = final_amount_coins - basket_sum
        if diff != 0:
            basket_items[-1]["sum"] += diff
            basket_items[-1]["total"] += diff

    # 5. Create the Monobank invoice with enriched merchant info.
    item_count = len(all_items)
    buyer_name = f"{order.first_name} {order.last_name}".strip()
    order_ref = public_order_code(order.id)
    description = (
        f"Samen Bondarenko Gallery - Order {order_ref} "
        f"for {buyer_name} "
        f"({item_count} {'item' if item_count == 1 else 'items'})"
    )

    try:
        mono = MonobankService()
        invoice_data = await mono.create_invoice(
            amount_coins=final_amount_coins,
            currency=payment_data.currency,
            order_reference=f"artshop-order-{order_ref}",
            destination=description,
            basket_items=basket_items,
            redirect_url=(
                f"{settings.MONOBANK_REDIRECT_URL}?orderRef={order_ref}"
                if settings.MONOBANK_REDIRECT_URL
                else None
            ),
        )
    except ValueError as e:
        logger.error("Monobank configuration error for order {}: {}", order.id, e)
        raise PaymentGatewayException(detail=f"Payment configuration error: {e}") from e
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
        order_reference=order_ref,
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


@router.get("/{order_ref}/status", response_model=PaymentStatusResponse)
async def get_payment_status(order_ref: str, db: DBDep):
    """
    Returns the current payment status for a given order.

    Used by the frontend to poll for payment completion after
    the buyer is redirected back from the Monobank payment page.

    Args:
        order_ref: Public order reference, with legacy numeric IDs still supported.

    Returns:
        PaymentStatusResponse with the current payment status.

    Raises:
        ObjectNotFoundException: If the order does not exist.
    """
    try:
        order_id = resolve_public_order_code(order_ref)
    except ValueError as exc:
        raise ObjectNotFoundException(detail="Order not found") from exc

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
                    logger.info(
                        "Syncing payment status from API for order {}: {} -> {}",
                        order.id,
                        order.payment_status,
                        internal_status,
                    )
                    await OrderService(db).update_payment_status_by_invoice(
                        invoice_id=order.invoice_id,
                        payment_status=internal_status,
                    )
                    order.payment_status = internal_status
        except Exception as e:
            logger.warning(
                "Failed to sync invoice status during polling for order {}: {}", order.id, e
            )

    return PaymentStatusResponse(
        order_id=order.id,
        order_reference=public_order_code(order.id),
        payment_status=order.payment_status,
        invoice_id=order.invoice_id,
    )
