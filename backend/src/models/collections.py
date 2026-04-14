"""
SQLAlchemy database model for artwork collections.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.database import Base

if TYPE_CHECKING:
    from src.models.artworks import ArtworksOrm


class CollectionsOrm(Base):
    """
    Represents a group of artworks (e.g., 'Nature', 'Abstract').
    Used for categorizing artworks.
    """

    __tablename__ = "collections"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    title: Mapped[str] = mapped_column(String(100), unique=True)

    # Relationships
    artworks: Mapped[list["ArtworksOrm"]] = relationship(back_populates="collection")

    def __str__(self):
        return self.title
