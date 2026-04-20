"""
SQLAlchemy models for the imported Prodigi catalog dataset.

This layer stores the supplier catalog in a normalized form:
    ProdigiCatalogProductOrm  - base SKU-level product identity
        -> ProdigiCatalogVariantOrm - unique attribute combination for that SKU
            -> ProdigiCatalogRouteOrm - destination/shipping specific pricing row

The goal is to preserve the raw CSV catalog faithfully while also exposing
normalized fields that make product filtering practical for the storefront.
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


class ProdigiCatalogProductOrm(Base):
    """Base imported product keyed by supplier SKU."""

    __tablename__ = "prodigi_catalog_products"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sku: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    category: Mapped[str | None] = mapped_column(String(120), nullable=True)
    product_type: Mapped[str | None] = mapped_column(String(120), nullable=True)
    product_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    size_cm: Mapped[str | None] = mapped_column(String(80), nullable=True)
    size_inches: Mapped[str | None] = mapped_column(String(80), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now(),
        onupdate=func.now(),
    )

    variants: Mapped[list["ProdigiCatalogVariantOrm"]] = relationship(
        "ProdigiCatalogVariantOrm",
        back_populates="product",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class ProdigiCatalogVariantOrm(Base):
    """Concrete sellable variant defined by a SKU plus attribute combination."""

    __tablename__ = "prodigi_catalog_variants"
    __table_args__ = (UniqueConstraint("product_id", "variant_key", name="uq_prodigi_variant_product_key"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    product_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("prodigi_catalog_products.id", ondelete="CASCADE"),
        index=True,
    )
    variant_key: Mapped[str] = mapped_column(String(500), index=True)

    finish: Mapped[str | None] = mapped_column(String(120), nullable=True)
    color: Mapped[str | None] = mapped_column(String(80), nullable=True)
    frame: Mapped[str | None] = mapped_column(String(160), nullable=True)
    style: Mapped[str | None] = mapped_column(String(200), nullable=True)
    glaze: Mapped[str | None] = mapped_column(String(160), nullable=True)
    mount: Mapped[str | None] = mapped_column(String(120), nullable=True)
    mount_color: Mapped[str | None] = mapped_column(String(120), nullable=True)
    paper_type: Mapped[str | None] = mapped_column(String(120), nullable=True)
    substrate_weight: Mapped[str | None] = mapped_column(String(80), nullable=True)
    wrap: Mapped[str | None] = mapped_column(String(80), nullable=True)
    edge: Mapped[str | None] = mapped_column(String(80), nullable=True)

    raw_attributes: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    normalized_medium: Mapped[str | None] = mapped_column(String(40), index=True, nullable=True)
    normalized_presentation: Mapped[str | None] = mapped_column(
        String(40), index=True, nullable=True
    )
    normalized_frame_type: Mapped[str | None] = mapped_column(
        String(40), index=True, nullable=True
    )
    normalized_material: Mapped[str | None] = mapped_column(String(80), index=True, nullable=True)
    is_relevant_for_artshop: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", index=True
    )

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now(),
        onupdate=func.now(),
    )

    product: Mapped["ProdigiCatalogProductOrm"] = relationship(
        "ProdigiCatalogProductOrm",
        back_populates="variants",
        lazy="selectin",
    )
    routes: Mapped[list["ProdigiCatalogRouteOrm"]] = relationship(
        "ProdigiCatalogRouteOrm",
        back_populates="variant",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class ProdigiCatalogRouteOrm(Base):
    """Destination/shipping-specific price row for a variant."""

    __tablename__ = "prodigi_catalog_routes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    variant_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("prodigi_catalog_variants.id", ondelete="CASCADE"),
        index=True,
    )
    route_key: Mapped[str] = mapped_column(String(500), unique=True, index=True)

    source_country: Mapped[str | None] = mapped_column(String(8), index=True, nullable=True)
    destination_country: Mapped[str | None] = mapped_column(String(8), index=True, nullable=True)
    destination_country_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    region_id: Mapped[str | None] = mapped_column(String(80), index=True, nullable=True)

    shipping_method: Mapped[str | None] = mapped_column(String(80), index=True, nullable=True)
    service_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    service_level: Mapped[str | None] = mapped_column(String(80), nullable=True)
    tracked_shipping: Mapped[str | None] = mapped_column(String(40), nullable=True)

    product_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    product_currency: Mapped[str | None] = mapped_column(String(8), nullable=True)
    shipping_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    plus_one_shipping_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    shipping_currency: Mapped[str | None] = mapped_column(String(8), nullable=True)

    min_shipping_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_shipping_days: Mapped[int | None] = mapped_column(Integer, nullable=True)

    source_csv_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    raw_row: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now(),
        onupdate=func.now(),
    )

    variant: Mapped["ProdigiCatalogVariantOrm"] = relationship(
        "ProdigiCatalogVariantOrm",
        back_populates="routes",
        lazy="selectin",
    )
