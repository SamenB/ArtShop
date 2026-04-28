"""SQLAlchemy models for regional print pricing multipliers."""

from __future__ import annotations

from sqlalchemy import Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.database import Base


class PrintPricingRegionOrm(Base):
    """A named pricing region that groups countries under one markup strategy."""

    __tablename__ = "print_pricing_regions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    label: Mapped[str] = mapped_column(String(100), nullable=False)
    country_codes: Mapped[list[str]] = mapped_column(
        ARRAY(String(3)),
        nullable=False,
        server_default="{}",
        comment="ISO-3166-1 alpha-2 codes belonging to this region.",
    )
    default_multiplier: Mapped[float] = mapped_column(
        Float,
        nullable=False,
        server_default="3.0",
        comment="Fallback multiplier when no category override exists.",
    )
    sort_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    is_fallback: Mapped[bool] = mapped_column(
        default=False,
        server_default="false",
        comment="Fallback region for countries that are not explicitly assigned.",
    )

    multipliers: Mapped[list["PrintPricingRegionMultiplierOrm"]] = relationship(
        "PrintPricingRegionMultiplierOrm",
        back_populates="region",
        cascade="all, delete-orphan",
        order_by="PrintPricingRegionMultiplierOrm.category_id",
        lazy="selectin",
    )

    def __str__(self) -> str:
        return f"PricingRegion({self.slug}, countries={len(self.country_codes or [])})"


class PrintPricingRegionMultiplierOrm(Base):
    """Per-category markup multiplier override for a pricing region."""

    __tablename__ = "print_pricing_region_multipliers"
    __table_args__ = (
        UniqueConstraint("region_id", "category_id", name="uq_region_category_multiplier"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    region_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("print_pricing_regions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    category_id: Mapped[str] = mapped_column(
        String(60),
        nullable=False,
        comment="Prodigi storefront category id, e.g. paperPrintClassicFramed.",
    )
    multiplier: Mapped[float] = mapped_column(
        Float,
        nullable=False,
        comment="Retail price = supplier cost x multiplier.",
    )

    region: Mapped["PrintPricingRegionOrm"] = relationship(
        "PrintPricingRegionOrm",
        back_populates="multipliers",
    )

    def __str__(self) -> str:
        return f"RegionMultiplier(region={self.region_id}, {self.category_id}=x{self.multiplier})"
