from __future__ import annotations
from typing import TYPE_CHECKING

from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import String, BigInteger, ForeignKey, JSON
from src.database import Base

if TYPE_CHECKING:
    from src.models.tags import TagsOrm


class ArtworksOrm(Base):
    __tablename__ = "artworks"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    title: Mapped[str] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(String(1000000))
    is_display_only: Mapped[bool] = mapped_column(default=False)
    original_price: Mapped[int | None] = mapped_column(default=None)
    original_status: Mapped[str] = mapped_column(
        String(20),
        default="available",
        server_default="available",
    )
    print_price: Mapped[int | None] = mapped_column(default=None)
    prints_total: Mapped[int] = mapped_column(default=27)
    prints_available: Mapped[int] = mapped_column(default=27)
    images: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)

    tags: Mapped[list["TagsOrm"]] = relationship(
        secondary="artwork_tags", back_populates="artworks"
    )

    def __str__(self):
        return self.title


