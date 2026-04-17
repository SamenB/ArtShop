"""
API endpoint for sending Telegram messages to print partners.

Endpoints:
    POST /telegram/send-print-order  — Dispatches a formatted print order to a partner's chat.
    GET  /telegram/status            — Checks whether the bot token and admin chat are configured.

Admin-only. The bot token is stored server-side (TELEGRAM_BOT_TOKEN env var) so it
is never exposed to the browser.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from src.api.dependencies import AdminDep
from src.config import settings
from src.connectors.telegram import send_telegram_message

router = APIRouter(prefix="/telegram", tags=["Telegram"])


class TelegramSendRequest(BaseModel):
    """Request body for dispatching a message to a Telegram chat."""

    chat_id: str = Field(..., description="Partner's Telegram chat_id or @username")
    message: str = Field(..., min_length=1, max_length=4096, description="Pre-formatted HTML message")


class TelegramSendResponse(BaseModel):
    """Response from a Telegram send attempt."""

    success: bool
    detail: str


@router.get("/status")
async def telegram_status(admin_id: AdminDep):
    """
    Returns the current Telegram integration configuration status.
    Useful for the admin panel to show/hide Telegram features with live feedback.
    """
    return {
        "bot_configured": bool(settings.TELEGRAM_BOT_TOKEN),
        "admin_chat_configured": bool(settings.TELEGRAM_ADMIN_CHAT_ID),
    }


@router.post("/send-print-order", response_model=TelegramSendResponse)
async def send_print_order(
    body: TelegramSendRequest,
    admin_id: AdminDep,
):
    """
    Dispatches a print order message to a partner via the Telegram Bot API.

    The message is pre-formatted by the frontend using the partner's template.
    This endpoint purely proxies the payload to Telegram, keeping the bot token
    server-side and out of the browser.

    Args:
        body.chat_id: The partner's Telegram chat ID or @username.
        body.message: HTML-formatted message body.

    Returns:
        TelegramSendResponse with success flag and detail string.
    """
    if not settings.TELEGRAM_BOT_TOKEN:
        raise HTTPException(
            status_code=503,
            detail="Telegram bot is not configured. Set TELEGRAM_BOT_TOKEN in .env.",
        )

    success = await send_telegram_message(
        chat_id=body.chat_id,
        text=body.message,
        parse_mode="HTML",
    )

    if success:
        return TelegramSendResponse(success=True, detail="Message delivered to Telegram.")
    else:
        return TelegramSendResponse(
            success=False,
            detail="Failed to deliver message. Check bot token and partner chat_id.",
        )
