"""
SQLAlchemy database model for global site settings.
"""

from sqlalchemy import Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from src.database import Base


class SiteSettingsOrm(Base):
    """
    Stores global configuration for the application.
    Includes technical contacts, about texts, and static images for the landing page.

    Note: Print pricing is managed separately via PrintPricingOrm.
    """

    __tablename__ = "site_settings"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)

    # Texts
    about_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    contact_email: Mapped[str | None] = mapped_column(String(200), nullable=True)
    owner_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    owner_email: Mapped[str | None] = mapped_column(String(200), nullable=True)
    owner_phone: Mapped[str | None] = mapped_column(String(80), nullable=True)
    owner_telegram_chat_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    social_instagram: Mapped[str | None] = mapped_column(String(200), nullable=True)
    social_telegram: Mapped[str | None] = mapped_column(String(200), nullable=True)
    social_threads: Mapped[str | None] = mapped_column(String(200), nullable=True)
    social_link: Mapped[str | None] = mapped_column(String(200), nullable=True)  # legacy fallback
    studio_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    footer_text_discover: Mapped[str | None] = mapped_column(Text, nullable=True)
    footer_text_services: Mapped[str | None] = mapped_column(Text, nullable=True)
    footer_text_circle: Mapped[str | None] = mapped_column(Text, nullable=True)
    shipping_page_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    faq_page_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    terms_page_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    privacy_page_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    prodigi_fulfillment_mode: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="automatic",
        server_default="automatic",
    )

    # Images
    artist_home_photo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    artist_about_photo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    main_bg_desktop_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    main_bg_mobile_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
