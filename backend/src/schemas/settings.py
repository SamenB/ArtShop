"""
Pydantic schemas for site settings data validation and serialization.
"""

from typing import Optional

from pydantic import BaseModel


class SiteSettingsBase(BaseModel):
    """
    Base schema for site configuration.
    Includes branding texts, image URLs, and static homepage media.

    Note: Print pricing is managed separately via the /print-pricing API.
    """

    about_text: Optional[str] = None
    contact_email: Optional[str] = None
    owner_name: Optional[str] = None
    owner_email: Optional[str] = None
    owner_phone: Optional[str] = None
    owner_telegram_chat_id: Optional[str] = None
    social_instagram: Optional[str] = None
    social_telegram: Optional[str] = None
    social_threads: Optional[str] = None
    social_link: Optional[str] = None
    studio_address: Optional[str] = None
    footer_text_discover: Optional[str] = None
    footer_text_services: Optional[str] = None
    footer_text_circle: Optional[str] = None
    shipping_page_text: Optional[str] = None
    faq_page_text: Optional[str] = None
    terms_page_text: Optional[str] = None
    privacy_page_text: Optional[str] = None
    prodigi_fulfillment_mode: Optional[str] = None
    artist_home_photo_url: Optional[str] = None
    artist_about_photo_url: Optional[str] = None
    main_bg_desktop_url: Optional[str] = None
    main_bg_mobile_url: Optional[str] = None


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
