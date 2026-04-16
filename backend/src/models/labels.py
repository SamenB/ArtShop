"""
SQLAlchemy database models for labels and their association with artworks.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.database import Base

if TYPE_CHECKING:
    from src.models.artworks import ArtworksOrm
    from src.models.label_categories import LabelCategoriesOrm


class LabelsOrm(Base):
    """
    Represents a label (formerly tag) used to categorize artworks.
    Labels must optionally belong to a category.
    """

    __tablename__ = "labels"
    __table_args__ = (UniqueConstraint("title", "category_id", name="uq_label_title_category"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    title: Mapped[str] = mapped_column(String(100))

    # Optional foreign key to a category (e.g. Medium, General)
    category_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("label_categories.id", ondelete="SET NULL"), nullable=True
    )

    # Relationships
    category: Mapped["LabelCategoriesOrm"] = relationship(back_populates="labels")

    artworks: Mapped[list["ArtworksOrm"]] = relationship(
        secondary="artwork_labels", back_populates="labels"
    )

    def __str__(self):
        return self.title


class ArtworkLabelsOrm(Base):
    """
    Many-to-many association table linking artworks and labels.
    """

    __tablename__ = "artwork_labels"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    artwork_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("artworks.id", ondelete="CASCADE")
    )
    label_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("labels.id", ondelete="CASCADE"))
