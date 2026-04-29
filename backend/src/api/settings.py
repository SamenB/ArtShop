"""
API endpoints for managing global site settings.
Provides functionality to retrieve and update configurations like contact info and homepage media.
"""

from fastapi import APIRouter

from src.api.dependencies import AdminDep, DBDep
from src.config import settings as app_settings
from src.models.site_settings import SiteSettingsOrm
from src.schemas.settings import SiteSettingsResponse, SiteSettingsUpdate

router = APIRouter(prefix="/settings", tags=["Settings"])


@router.get("", response_model=SiteSettingsResponse)
async def get_settings(db: DBDep):
    """
    Retrieves the global site settings.
    Initializes default settings if none exist.
    """
    settings_obj = await db.session.get(SiteSettingsOrm, 1)
    if not settings_obj:
        settings_obj = SiteSettingsOrm(id=1)
        db.session.add(settings_obj)
        await db.commit()
        await db.session.refresh(settings_obj)
    if not settings_obj.owner_telegram_chat_id and app_settings.TELEGRAM_ADMIN_CHAT_ID:
        settings_obj.owner_telegram_chat_id = app_settings.TELEGRAM_ADMIN_CHAT_ID
        await db.commit()
        await db.session.refresh(settings_obj)
    return settings_obj


@router.put("", response_model=SiteSettingsResponse)
async def update_settings(data: SiteSettingsUpdate, admin_id: AdminDep, db: DBDep):
    """
    Updates the global site settings. Requires admin privileges.
    """
    settings_obj = await db.session.get(SiteSettingsOrm, 1)
    if not settings_obj:
        settings_obj = SiteSettingsOrm(id=1)
        db.session.add(settings_obj)

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(settings_obj, key, value)

    await db.commit()
    await db.session.refresh(settings_obj)
    return settings_obj
