from sqlalchemy import Boolean, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from src.database import Base


class SiteSettingsOrm(Base):
    __tablename__ = "site_settings"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)

    # Texts
    about_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    contact_email: Mapped[str | None] = mapped_column(String(200), nullable=True)
    social_link: Mapped[str | None] = mapped_column(String(200), nullable=True)
    studio_address: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Images
    artist_home_photo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    artist_about_photo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    main_bg_desktop_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    main_bg_mobile_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Hero slideshow covers (up to 3)
    cover_2_desktop_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    cover_2_mobile_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    cover_3_desktop_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    cover_3_mobile_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Hero slideshow options
    hero_ken_burns_enabled: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    hero_slide_duration: Mapped[int] = mapped_column(Integer, default=15, server_default="15")

    # Financials
    global_print_price: Mapped[int] = mapped_column(Integer, default=150)
