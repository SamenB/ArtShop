"""
SQLAlchemy database model for artworks.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import JSON, BigInteger, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.database import Base

if TYPE_CHECKING:
    from src.models.labels import LabelsOrm
    from src.models.print_pricing import PrintAspectRatioOrm
    from src.models.users import UsersOrm


class ArtworksOrm(Base):
    """
    Represents an artwork in the store.
    Includes metadata like title, description, physical dimensions, and pricing.

    Print availability is controlled by five independent boolean flags:
        has_original            — Original painting is offered for sale
        has_canvas_print        — Open edition canvas print is available
        has_canvas_print_limited — Limited edition canvas print (signed/numbered)
        has_paper_print         — Open edition paper print is available
        has_paper_print_limited — Limited edition paper print (signed/numbered)

    Pricing for prints lives in the PrintPricingOrm table (shared catalog).
    """

    __tablename__ = "artworks"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    title: Mapped[str] = mapped_column(String(100))
    slug: Mapped[str | None] = mapped_column(String(255), unique=True, index=True, nullable=True)
    description: Mapped[str | None] = mapped_column(String(1000000))
    original_price: Mapped[int | None] = mapped_column(default=None)
    original_status: Mapped[str] = mapped_column(
        String(20),
        default="available",
        server_default="available",
    )
    year: Mapped[int | None] = mapped_column(default=None)
    style: Mapped[str | None] = mapped_column(String(100), default=None)
    width_cm: Mapped[float | None] = mapped_column(default=None)
    height_cm: Mapped[float | None] = mapped_column(default=None)
    depth_cm: Mapped[float | None] = mapped_column(default=None)
    width_in: Mapped[float | None] = mapped_column(default=None)
    height_in: Mapped[float | None] = mapped_column(default=None)
    depth_in: Mapped[float | None] = mapped_column(default=None)
    orientation: Mapped[str] = mapped_column(String(20), default="vertical")
    images: Mapped[list[str | dict] | None] = mapped_column(JSON, nullable=True)

    # ── Print availability flags ──────────────────────────────────────────────
    # Each flag independently controls whether a given print type is purchasable.
    has_original: Mapped[bool] = mapped_column(default=False, server_default="false")
    has_canvas_print: Mapped[bool] = mapped_column(default=False, server_default="false")
    has_canvas_print_limited: Mapped[bool] = mapped_column(default=False, server_default="false")
    has_paper_print: Mapped[bool] = mapped_column(default=False, server_default="false")
    has_paper_print_limited: Mapped[bool] = mapped_column(default=False, server_default="false")

    # ── Limited edition series sizes ───────────────────────────────────────────
    # Total number of prints in the numbered series (e.g. 5 means "X/5").
    # Only meaningful when the corresponding _limited flag is True.
    canvas_print_limited_quantity: Mapped[int | None] = mapped_column(default=None, nullable=True)
    paper_print_limited_quantity: Mapped[int | None] = mapped_column(default=None, nullable=True)

    # ── Print configuration ────────────────────────────────────────────────────
    # References the aspect ratio category for this artwork's print price grid.
    # If null, no specific ratio is assigned and all sizes are available.
    print_aspect_ratio_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("print_aspect_ratios.id", ondelete="SET NULL"),
        nullable=True,
        default=None,
        index=True,
    )
    # Restricts which sizes from the ratio's grid are offered for this artwork.
    # Sizes are matched by exact size_label string comparison.
    # e.g. print_min_size_label="30×40 cm" means nothing smaller is offered.
    print_min_size_label: Mapped[str | None] = mapped_column(String(50), nullable=True, default=None)
    print_max_size_label: Mapped[str | None] = mapped_column(String(50), nullable=True, default=None)

    # Relationships
    print_aspect_ratio: Mapped["PrintAspectRatioOrm | None"] = relationship(
        "PrintAspectRatioOrm",
        foreign_keys=[print_aspect_ratio_id],
        lazy="selectin",
    )
    labels: Mapped[list["LabelsOrm"]] = relationship(
        secondary="artwork_labels", back_populates="artworks"
    )

    liked_by_users: Mapped[list["UsersOrm"]] = relationship(
        secondary="user_likes", back_populates="liked_artworks"
    )

    def __str__(self):
        return self.title
