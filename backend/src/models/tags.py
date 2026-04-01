from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.database import Base

if TYPE_CHECKING:
    from src.models.artworks import ArtworksOrm


class TagsOrm(Base):
    __tablename__ = "tags"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    title: Mapped[str] = mapped_column(String(100), unique=True)
    category: Mapped[str | None] = mapped_column(String(50), nullable=True, default=None)
    # category values: 'medium' | 'general' | None

    def __str__(self):
        return self.title

    artworks: Mapped[list["ArtworksOrm"]] = relationship(
        secondary="artwork_tags", back_populates="tags"
    )


# m2m table
class ArtworkTagsOrm(Base):
    __tablename__ = "artwork_tags"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    artwork_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("artworks.id"))
    tag_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tags.id"))
