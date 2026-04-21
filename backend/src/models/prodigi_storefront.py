"""
Materialized storefront snapshot tables for curated Prodigi offers.

This layer is intentionally separate from the raw supplier catalog tables:
    ProdigiStorefrontBakeOrm         - one bake run / snapshot metadata
        -> ProdigiStorefrontOfferGroupOrm - one country + ratio + category card
            -> ProdigiStorefrontOfferSizeOrm - one visible size option inside that card

The goal is to persist the exact catalog that the website should expose after
our ArtShop business rules are applied.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.database import Base


class ProdigiStorefrontBakeOrm(Base):
    __tablename__ = "prodigi_storefront_bakes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    bake_key: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    paper_material: Mapped[str] = mapped_column(String(120), index=True)
    include_notice_level: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        server_default="true",
        nullable=False,
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        server_default="true",
        nullable=False,
        index=True,
    )
    status: Mapped[str] = mapped_column(String(30), default="ready", server_default="ready")
    ratio_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    country_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    offer_group_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    offer_size_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    offer_groups: Mapped[list["ProdigiStorefrontOfferGroupOrm"]] = relationship(
        "ProdigiStorefrontOfferGroupOrm",
        back_populates="bake",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class ProdigiStorefrontOfferGroupOrm(Base):
    __tablename__ = "prodigi_storefront_offer_groups"
    __table_args__ = (
        UniqueConstraint(
            "bake_id",
            "ratio_label",
            "destination_country",
            "category_id",
            name="uq_prodigi_storefront_group_bake_ratio_country_category",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    bake_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("prodigi_storefront_bakes.id", ondelete="CASCADE"),
        index=True,
    )
    ratio_label: Mapped[str] = mapped_column(String(20), index=True)
    ratio_title: Mapped[str | None] = mapped_column(String(120), nullable=True)
    destination_country: Mapped[str] = mapped_column(String(8), index=True)
    destination_country_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    category_id: Mapped[str] = mapped_column(String(80), index=True)
    category_label: Mapped[str] = mapped_column(String(120))
    material_label: Mapped[str | None] = mapped_column(String(120), nullable=True)
    frame_label: Mapped[str | None] = mapped_column(String(120), nullable=True)

    storefront_action: Mapped[str] = mapped_column(String(30), index=True)
    fulfillment_level: Mapped[str] = mapped_column(String(30), index=True)
    geography_scope: Mapped[str] = mapped_column(String(30), index=True)
    tax_risk: Mapped[str] = mapped_column(String(30), index=True)

    source_countries: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    fastest_delivery_days: Mapped[str | None] = mapped_column(String(40), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    fixed_attributes: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    recommended_defaults: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    allowed_attributes: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    available_size_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    min_total_cost: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    max_total_cost: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    currency: Mapped[str | None] = mapped_column(String(8), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    bake: Mapped["ProdigiStorefrontBakeOrm"] = relationship(
        "ProdigiStorefrontBakeOrm",
        back_populates="offer_groups",
        lazy="selectin",
    )
    sizes: Mapped[list["ProdigiStorefrontOfferSizeOrm"]] = relationship(
        "ProdigiStorefrontOfferSizeOrm",
        back_populates="offer_group",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class ProdigiStorefrontOfferSizeOrm(Base):
    __tablename__ = "prodigi_storefront_offer_sizes"
    __table_args__ = (
        UniqueConstraint(
            "offer_group_id",
            "slot_size_label",
            name="uq_prodigi_storefront_size_group_slot",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    offer_group_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("prodigi_storefront_offer_groups.id", ondelete="CASCADE"),
        index=True,
    )
    slot_size_label: Mapped[str] = mapped_column(String(80), index=True)
    size_label: Mapped[str | None] = mapped_column(String(80), nullable=True)
    available: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    is_exact_match: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    centroid_size_label: Mapped[str | None] = mapped_column(String(80), nullable=True)
    member_size_labels: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)

    sku: Mapped[str | None] = mapped_column(String(120), nullable=True)
    source_country: Mapped[str | None] = mapped_column(String(8), nullable=True)
    currency: Mapped[str | None] = mapped_column(String(8), nullable=True)
    product_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    shipping_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    total_cost: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    delivery_days: Mapped[str | None] = mapped_column(String(40), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    offer_group: Mapped["ProdigiStorefrontOfferGroupOrm"] = relationship(
        "ProdigiStorefrontOfferGroupOrm",
        back_populates="sizes",
        lazy="selectin",
    )
