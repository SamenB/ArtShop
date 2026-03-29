from typing import Optional

from pydantic import BaseModel


class SiteSettingsBase(BaseModel):
    about_text: Optional[str] = None
    contact_email: Optional[str] = None
    artist_photo_url: Optional[str] = None
    main_bg_desktop_url: Optional[str] = None
    main_bg_mobile_url: Optional[str] = None
    global_print_price: int = 150


class SiteSettingsResponse(SiteSettingsBase):
    id: int


class SiteSettingsUpdate(SiteSettingsBase):
    pass
