from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.database import Base
from datetime import datetime
from sqlalchemy import DateTime, Integer, ForeignKey, func, String


class OrdersOrm(Base):
    __tablename__ = "orders"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"))
    artwork_id: Mapped[int] = mapped_column(Integer, ForeignKey("artworks.id"))
    edition_type: Mapped[str] = mapped_column(String(20))
    price: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())

    user: Mapped["UsersOrm"] = relationship("UsersOrm")
    artwork: Mapped["ArtworksOrm"] = relationship("ArtworksOrm")


    @property
    def total_price(self) -> int:
        return self.price

    def __str__(self):
        return f"Order #{self.id}"

