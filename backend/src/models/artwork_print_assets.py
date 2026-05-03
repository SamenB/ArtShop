"""
Structured print-preparation assets attached to artworks.

These assets are intentionally separated from the artwork body itself:
- the artwork stores the durable configuration and source master metadata,
- this table stores prepared delivery-ready files for concrete categories/sizes.

That split lets the admin workflow validate exactly which printable variants are
still missing without coupling the rest of the backend to a provider-specific
blob of JSON.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    JSON,
    BigInteger,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from src.database import Base


class ArtworkPrintAssetOrm(Base):
    __tablename__ = "artwork_print_assets"
    __table_args__ = (
        UniqueConstraint(
            "artwork_id",
            "provider_key",
            "category_id",
            "asset_role",
            "slot_size_label",
            name="uq_artwork_print_asset_scope",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    artwork_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("artworks.id", ondelete="CASCADE"),
        index=True,
    )
    provider_key: Mapped[str] = mapped_column(String(40), index=True)
    category_id: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    asset_role: Mapped[str] = mapped_column(String(80), index=True)
    slot_size_label: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)

    file_url: Mapped[str] = mapped_column(String(1000))
    file_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    file_ext: Mapped[str | None] = mapped_column(String(20), nullable=True)
    mime_type: Mapped[str | None] = mapped_column(String(120), nullable=True)
    file_size_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    checksum_sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)
    file_metadata: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now(),
        onupdate=func.now(),
    )
