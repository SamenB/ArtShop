"""
SQLAlchemy database model for label categories.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.database import Base

if TYPE_CHECKING:
    from src.models.labels import LabelsOrm


class LabelCategoriesOrm(Base):
    """
    Represents a category grouping for labels (e.g., 'Medium', 'Theme', 'Orientation').
    """

    __tablename__ = "label_categories"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    title: Mapped[str] = mapped_column(String(100), unique=True)

    # Optional styling identifier or color for the UI to render the category dynamically
    accent_color: Mapped[str | None] = mapped_column(String(20), default=None, nullable=True)

    # Relationships
    labels: Mapped[list["LabelsOrm"]] = relationship(
        back_populates="category", cascade="all, delete-orphan"
    )

    def __str__(self):
        return self.title
