from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.database import Base
from datetime import datetime
from sqlalchemy import DateTime, Integer, ForeignKey, func


class OrdersOrm(Base):
    __tablename__ = "orders"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"))
    collection_id: Mapped[int] = mapped_column(Integer, ForeignKey("collections.id"))
    artwork_id: Mapped[int] = mapped_column(Integer, ForeignKey("artworks.id"))
    price: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())

    user: Mapped["UsersOrm"] = relationship("UsersOrm")
    collection: Mapped["CollectionsOrm"] = relationship("CollectionsOrm")
    artwork: Mapped["ArtworksOrm"] = relationship("ArtworksOrm")


    @property
    def total_price(self) -> int:
        return self.price

    def __str__(self):
        return f"Order #{self.id}"

