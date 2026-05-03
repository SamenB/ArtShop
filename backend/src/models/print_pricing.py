"""
SQLAlchemy models for normalized print aspect ratios and legacy manual pricing rows.

Architecture:
    PrintAspectRatioOrm  - Stable ratio family used by artworks and provider catalogs.
        |- PrintPricingOrm - Optional legacy manual pricing row kept for compatibility.

Artworks now store only a provider-neutral aspect ratio reference. Concrete sizes,
prices, and availability are resolved later from the active print-provider storefront.
"""

from __future__ import annotations

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.database import Base


class PrintAspectRatioOrm(Base):
    """
    Defines a normalized print aspect ratio family.

    Examples of labels: "3:4", "2:3", "1:1", "9:16".
    These ratio families are referenced by artworks and later matched against
    provider-specific catalogs such as the baked Prodigi storefront.
    """

    __tablename__ = "print_aspect_ratios"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    label: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(String(200), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0")

    # Optional legacy manual pricing rows kept for backward compatibility.
    pricing_rows: Mapped[list["PrintPricingOrm"]] = relationship(
        "PrintPricingOrm",
        back_populates="aspect_ratio",
        cascade="all, delete-orphan",
        order_by="PrintPricingOrm.print_type, PrintPricingOrm.price",
        lazy="selectin",
    )

    def __str__(self) -> str:
        return f"AspectRatio({self.label})"


class PrintPricingOrm(Base):
    """
    Represents a single legacy manual price entry.

    Each row defines the price for a specific aspect_ratio + print_type + size
    combination. Runtime storefront pricing no longer depends on this table;
    the active provider snapshot is now the source of truth for live offers.

    Print types:
        canvas          - Open edition canvas print
        canvas_limited  - Limited edition canvas print (signed, numbered)
        paper           - Open edition paper print
        paper_limited   - Limited edition paper print (signed, numbered)
    """

    __tablename__ = "print_pricing"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    aspect_ratio_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("print_aspect_ratios.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    print_type: Mapped[str] = mapped_column(
        String(30),
        index=True,
        comment="canvas | canvas_limited | paper | paper_limited",
    )
    size_label: Mapped[str] = mapped_column(
        String(50),
        comment='Human-readable size string, e.g. "30x40 cm" or "12x16 in"',
    )
    price: Mapped[int] = mapped_column(
        Integer,
        comment="Price in whole USD",
    )

    aspect_ratio: Mapped["PrintAspectRatioOrm"] = relationship(
        "PrintAspectRatioOrm",
        back_populates="pricing_rows",
    )

    def __str__(self) -> str:
        return f"PrintPricing({self.aspect_ratio_id} | {self.print_type} {self.size_label} = ${self.price})"
