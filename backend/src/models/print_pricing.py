"""
SQLAlchemy database models for print pricing and aspect ratio configuration.

Architecture:
    PrintAspectRatioOrm  — Defines canvas proportions (e.g. "3:4 — Portrait").
        └── PrintPricingOrm  — Price entries for each print type + size within a ratio.

Each artwork then references one PrintAspectRatioOrm to indicate which
ratio's price grid applies to its prints. The artwork also stores
print_min_size_label / print_max_size_label to restrict which sizes from
the full grid are offered (e.g. due to quality limits at very large sizes).
"""

from __future__ import annotations

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.database import Base


class PrintAspectRatioOrm(Base):
    """
    Defines a canvas aspect ratio category that groups print pricing rows.

    Examples of labels: "3:4", "2:3", "1:1", "9:16"
    Each ratio has its own independent price grid for all four print types.

    Attributes:
        id          – Primary key.
        label       – Short ratio label shown in dropdowns, e.g. "3:4".
        description – Optional human-readable name, e.g. "Portrait (A4 family)".
        sort_order  – Controls display order in the admin UI (lower = first).
    """

    __tablename__ = "print_aspect_ratios"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    label: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(String(200), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0")

    # All pricing rows belonging to this aspect ratio
    pricing_rows: Mapped[list["PrintPricingOrm"]] = relationship(
        "PrintPricingOrm",
        back_populates="aspect_ratio",
        cascade="all, delete-orphan",
        order_by="PrintPricingOrm.print_type, PrintPricingOrm.price",
    )

    def __str__(self) -> str:
        return f"AspectRatio({self.label})"


class PrintPricingOrm(Base):
    """
    Represents a single price entry in the print catalog pricing grid.

    Each row defines the price for a specific aspect_ratio + print_type + size combination.
    The admin populates and manages these rows through the Print Pricing tab.

    Print types:
        canvas          — Open edition canvas print
        canvas_limited  — Limited edition canvas print (signed, numbered)
        paper           — Open edition paper print
        paper_limited   — Limited edition paper print (signed, numbered)
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
        comment='Human-readable size string, e.g. "30×40 cm" or "12×16 in"',
    )
    price: Mapped[int] = mapped_column(
        Integer,
        comment="Price in whole USD",
    )

    # Parent aspect ratio
    aspect_ratio: Mapped["PrintAspectRatioOrm"] = relationship(
        "PrintAspectRatioOrm",
        back_populates="pricing_rows",
    )

    def __str__(self) -> str:
        return f"PrintPricing({self.aspect_ratio_id} | {self.print_type} {self.size_label} = ${self.price})"
