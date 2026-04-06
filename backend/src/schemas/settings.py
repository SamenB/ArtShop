"""
Pydantic schemas for site settings data validation and serialization.
"""
from typing import Optional

from pydantic import BaseModel


class SiteSettingsBase(BaseModel):
    """
    Base schema for site configuration.
    Includes branding texts, image URLs, slideshow settings, and global print prices.
    """
    about_text: Optional[str] = None
    contact_email: Optional[str] = None
    social_link: Optional[str] = None
    studio_address: Optional[str] = None
    artist_home_photo_url: Optional[str] = None
    artist_about_photo_url: Optional[str] = None
    main_bg_desktop_url: Optional[str] = None
    main_bg_mobile_url: Optional[str] = None
    cover_2_desktop_url: Optional[str] = None
    cover_2_mobile_url: Optional[str] = None
    cover_3_desktop_url: Optional[str] = None
    cover_3_mobile_url: Optional[str] = None
    hero_ken_burns_enabled: bool = True
    hero_slide_duration: int = 15
    global_print_price: int = 150


class SiteSettingsResponse(SiteSettingsBase):
    """
    Represents site settings as retrieved from the database.
    """
    id: int


class SiteSettingsUpdate(SiteSettingsBase):
    """
    Schema for updating site settings.
    """
    pass
