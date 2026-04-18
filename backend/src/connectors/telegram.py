"""
Telegram Bot API connector.

Provides async helper functions to send messages via the Telegram Bot API.
Used for:
  - Admin new-order alerts (fired after payment is confirmed).
  - Print partner order dispatch (admin manually triggers from the order card).

All functions are non-blocking: they perform async HTTP calls and gracefully
log errors without propagating exceptions, so Telegram failures never
interrupt the primary request lifecycle.

Configuration (in .env):
    TELEGRAM_BOT_TOKEN      — bot token from @BotFather
    TELEGRAM_ADMIN_CHAT_ID  — your personal chat_id for new-order notifications
                              (obtain via @userinfobot in Telegram)
"""

import httpx
from loguru import logger

from src.config import settings

_TELEGRAM_API_BASE = "https://api.telegram.org"


def _bot_url(method: str) -> str:
    """Constructs the full Telegram Bot API endpoint URL for a given method."""
    return f"{_TELEGRAM_API_BASE}/bot{settings.TELEGRAM_BOT_TOKEN}/{method}"


async def send_telegram_message(
    chat_id: str,
    text: str,
    *,
    parse_mode: str = "HTML",
    disable_web_page_preview: bool = True,
) -> bool:
    """
    Sends a Telegram message to the specified chat.

    Args:
        chat_id: Target Telegram chat ID or @username.
        text: Message body (HTML formatted).
        parse_mode: 'HTML' or 'MarkdownV2'. Defaults to 'HTML'.
        disable_web_page_preview: Suppresses link previews.

    Returns:
        True if the message was delivered successfully, False otherwise.

    Note:
        This function never raises. All errors are logged and False is returned,
        so callers can inspect the result without try/except boilerplate.
    """
    if not settings.TELEGRAM_BOT_TOKEN:
        logger.warning("TELEGRAM_BOT_TOKEN is not configured — skipping Telegram message.")
        return False

    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": parse_mode,
        "disable_web_page_preview": disable_web_page_preview,
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(_bot_url("sendMessage"), json=payload)

        if response.status_code == 200:
            logger.info("Telegram message sent to chat_id={}", chat_id)
            return True
        else:
            logger.warning(
                "Telegram API error: status={} body={}",
                response.status_code,
                response.text[:200],
            )
            return False

    except httpx.TimeoutException:
        logger.warning("Telegram API timeout when sending to chat_id={}", chat_id)
        return False
    except Exception as exc:
        logger.error("Unexpected error sending Telegram message to {}: {}", chat_id, exc)
        return False


async def notify_admin_new_order(
    order_id: int,
    customer_name: str,
    total: int,
    items_summary: str,
    *,
    customer_email: str = "",
    customer_phone: str = "",
    shipping_city: str = "",
    shipping_country: str = "",
    payment_status: str = "paid",
) -> bool:
    """
    Sends a rich, actionable new-order notification to the configured admin chat.

    Fires only after payment is confirmed so the admin gets a single alert per
    order that genuinely requires fulfilment action.

    Args:
        order_id: Internal order identifier.
        customer_name: Full name (first + last) of the customer.
        total: Order total (USD).
        items_summary: Pre-formatted list of items — one item per line.
        customer_email: Buyer's email address.
        customer_phone: Buyer's contact phone.
        shipping_city: Destination city.
        shipping_country: Destination country.
        payment_status: Payment status label for display.

    Returns:
        True if delivered, False on any error.
    """
    if not settings.TELEGRAM_ADMIN_CHAT_ID:
        logger.debug("TELEGRAM_ADMIN_CHAT_ID not set — skipping admin new-order alert.")
        return False

    # Shipping destination line
    destination_parts = [p for p in (shipping_city, shipping_country) if p]
    destination = ", ".join(destination_parts) if destination_parts else "—"

    # Contact block
    contact_lines = []
    if customer_email:
        contact_lines.append(f"📧 {_escape_html(customer_email)}")
    if customer_phone:
        contact_lines.append(f"📱 {_escape_html(customer_phone)}")
    contact_block = "\n".join(contact_lines) if contact_lines else "📧 —"

    # Deep-link to admin dashboard orders tab
    admin_url = "http://localhost:3000/admin?tab=orders"

    text = (
        "🔔 <b>New Paid Order — Action Required!</b>\n"
        "━━━━━━━━━━━━━━━━━━━━━━\n\n"
        f"🛒 <b>Order #{order_id}</b>\n\n"
        f"👤 <b>{_escape_html(customer_name)}</b>\n"
        f"{contact_block}\n\n"
        f"📦 <b>Items:</b>\n{_escape_html(items_summary)}\n\n"
        f"📍 <b>Ships to:</b> {_escape_html(destination)}\n"
        f"💳 <b>Payment:</b> <code>{_escape_html(payment_status)}</code>\n"
        f"💰 <b>Total:</b> <code>${total}</code>\n\n"
        f'👉 <a href="{admin_url}">Open Admin Dashboard → Orders</a>'
    )

    return await send_telegram_message(settings.TELEGRAM_ADMIN_CHAT_ID, text)


async def send_print_order_to_partner(
    chat_id: str,
    message_text: str,
) -> bool:
    """
    Dispatches a print order message to a partner (print studio).

    Args:
        chat_id: Partner's Telegram chat ID or @username.
        message_text: Pre-formatted order message (HTML).

    Returns:
        True if delivered, False on any error.
    """
    return await send_telegram_message(chat_id, message_text)


def _escape_html(text: str) -> str:
    """Escapes HTML special characters to prevent injection in Telegram HTML mode."""
    return (
        str(text)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )
