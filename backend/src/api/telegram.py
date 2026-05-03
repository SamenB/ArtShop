"""
API endpoint for checking owner Telegram notification configuration.

Telegram is intentionally limited to owner alerts for now. Print fulfillment
goes through Prodigi, so there is no admin endpoint that dispatches orders to a
Telegram print partner.
"""

from fastapi import APIRouter

from src.api.dependencies import AdminDep
from src.config import settings

router = APIRouter(prefix="/telegram", tags=["Telegram"])


@router.get("/status")
async def telegram_status(admin_id: AdminDep):
    """
    Returns the current owner-alert Telegram configuration status.
    """
    return {
        "bot_configured": bool(settings.TELEGRAM_BOT_TOKEN),
    }
