from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy.orm import Mapped, mapped_column, relationship
from src.database import Base
from sqlalchemy import String, BigInteger, ForeignKey

if TYPE_CHECKING:
    from src.models.tags import TagsOrm


class ArtworksOrm(Base):
    __tablename__ = "artworks"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    collection_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("collections.id"))
    title: Mapped[str] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(String(1000000))
    price: Mapped[int]
    quantity: Mapped[int]

    tags: Mapped[list["TagsOrm"]] = relationship(
        secondary="artwork_tags", back_populates="artworks"
    )

    collection: Mapped["CollectionsOrm"] = relationship("CollectionsOrm", backref="artworks")

    def __str__(self):
        return self.title


