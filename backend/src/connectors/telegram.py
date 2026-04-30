"""
Telegram Bot API connector for owner new-order alerts.

Telegram is not a fulfillment transport in this project anymore. Print orders
are submitted through Prodigi, while Telegram only notifies the shop owner that
a customer order was created.
"""

import httpx
from loguru import logger

from src.config import settings

_TELEGRAM_API_BASE = "https://api.telegram.org"


def _bot_url(method: str) -> str:
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
    """
    if not settings.TELEGRAM_BOT_TOKEN:
        logger.warning("TELEGRAM_BOT_TOKEN is not configured; skipping Telegram message.")
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
            logger.info("Telegram owner alert sent to chat_id={}", chat_id)
            return True

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
    chat_id: str | None = None,
) -> bool:
    """
    Sends a new-order notification to the configured owner chat.
    """
    if not chat_id:
        logger.debug("Owner Telegram chat is not set; skipping new-order alert.")
        return False

    text = (
        f"<b>New Order #{order_id}</b>\n\n"
        f"<b>Customer:</b> {_escape_html(customer_name)}\n"
        f"<b>Items:</b>\n{_escape_html(items_summary)}\n\n"
        f"<b>Total:</b> <code>${total}</code>"
    )
    return await send_telegram_message(chat_id, text)


def _escape_html(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )
