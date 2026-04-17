"""
Telegram Bot API connector.

Provides async helper functions to send messages via the Telegram Bot API.
Used for:
  - Admin new-order alerts (fired on every successful order creation).
  - Print partner order dispatch (admin manually triggers from the order card).

All functions are non-blocking: they perform async HTTP calls and gracefully
log errors without propagating exceptions, so Telegram failures never
interrupt the primary request lifecycle.

Configuration (in .env):
    TELEGRAM_BOT_TOKEN  — bot token from @BotFather
    TELEGRAM_ADMIN_CHAT_ID — your personal chat_id for new-order notifications
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
        text: Message body (HTML or Markdown depending on parse_mode).
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


async def notify_admin_new_order(order_id: int, customer_name: str, total: int, items_summary: str) -> bool:
    """
    Sends a new order notification to the configured admin chat.

    Args:
        order_id: Internal order identifier.
        customer_name: Full name (first + last) of the customer.
        total: Order total in USD.
        items_summary: Human-readable list of ordered items.

    Returns:
        True if delivered, False on any error.
    """
    if not settings.TELEGRAM_ADMIN_CHAT_ID:
        logger.debug("TELEGRAM_ADMIN_CHAT_ID not set — skipping admin new-order alert.")
        return False

    text = (
        f"🛒 <b>New Order #{order_id}</b>\n\n"
        f"👤 <b>Customer:</b> {_escape_html(customer_name)}\n"
        f"📦 <b>Items:</b>\n{_escape_html(items_summary)}\n\n"
        f"💰 <b>Total:</b> <code>${total}</code>"
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
        text
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )
