"""
SQLAlchemy database models for tags and their association with artworks.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.database import Base

if TYPE_CHECKING:
    from src.models.artworks import ArtworksOrm


class TagsOrm(Base):
    """
    Represents a tag (e.g., 'Oil', 'Canvas', '2024') used to categorize artworks.
    Tags can optionally belong to a category like 'medium' or 'general'.
    """
    __tablename__ = "tags"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    title: Mapped[str] = mapped_column(String(100), unique=True)
    category: Mapped[str | None] = mapped_column(String(50), nullable=True, default=None)
    # Possible category values: 'medium', 'general', or None

    # Relationships
    artworks: Mapped[list["ArtworksOrm"]] = relationship(
        secondary="artwork_tags", back_populates="tags"
    )

    def __str__(self):
        return self.title


class ArtworkTagsOrm(Base):
    """
    Many-to-many association table linking artworks and tags.
    """
    __tablename__ = "artwork_tags"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    artwork_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("artworks.id"))
    tag_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tags.id"))
