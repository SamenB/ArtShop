"""
SQLAlchemy model for print pricing configuration.

Stores a size → price grid for each print type, editable via the admin panel.
"""

from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from src.database import Base


class PrintPricingOrm(Base):
    """
    Represents a single price entry in the print catalog pricing grid.

    Each row defines the price for a specific print type + size combination.
    The admin populates and manages these rows through the Print Pricing tab.

    Print types:
        canvas          — Open edition canvas print
        canvas_limited  — Limited edition canvas print (signed, numbered)
        paper           — Open edition paper print
        paper_limited   — Limited edition paper print (signed, numbered)
    """

    __tablename__ = "print_pricing"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
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

    def __str__(self) -> str:
        return f"PrintPricing({self.print_type} {self.size_label} = ${self.price})"
