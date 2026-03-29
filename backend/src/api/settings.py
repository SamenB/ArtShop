from fastapi import APIRouter

from src.api.dependencies import AdminDep, DBDep
from src.models.site_settings import SiteSettingsOrm
from src.schemas.settings import SiteSettingsResponse, SiteSettingsUpdate

router = APIRouter(prefix="/settings", tags=["Settings"])


@router.get("", response_model=SiteSettingsResponse)
async def get_settings(db: DBDep):
    settings_obj = await db.session.get(SiteSettingsOrm, 1)
    if not settings_obj:
        settings_obj = SiteSettingsOrm(id=1)
        db.session.add(settings_obj)
        await db.commit()
    return settings_obj


@router.put("", response_model=SiteSettingsResponse)
async def update_settings(data: SiteSettingsUpdate, admin_id: AdminDep, db: DBDep):
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
