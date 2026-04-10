"""
SQLAlchemy database models for orders and their constituent items.
"""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.database import Base


class OrdersOrm(Base):
    """
    Represents a customer order.
    Stores contact information, billing details, marketing preferences, and payment status.
    """

    __tablename__ = "orders"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)

    # Guest & Contact Info
    first_name: Mapped[str] = mapped_column(String(100))
    last_name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(200))
    phone: Mapped[str] = mapped_column(String(50))

    # Marketing & Discovery
    newsletter_opt_in: Mapped[bool] = mapped_column(default=False)
    discovery_source: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Shipping Address (required for worldwide delivery)
    shipping_country: Mapped[str | None] = mapped_column(String(100), nullable=True)
    shipping_country_code: Mapped[str | None] = mapped_column(String(2), nullable=True)
    shipping_state: Mapped[str | None] = mapped_column(String(100), nullable=True)
    shipping_city: Mapped[str | None] = mapped_column(String(200), nullable=True)
    shipping_address_line1: Mapped[str | None] = mapped_column(String(500), nullable=True)
    shipping_address_line2: Mapped[str | None] = mapped_column(String(500), nullable=True)
    shipping_postal_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    shipping_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    shipping_notes: Mapped[str | None] = mapped_column(String(1000), nullable=True)

    # Order Specifics
    promo_code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    total_price: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())

    # Payment status options: pending, paid, failed, mock_paid
    payment_status: Mapped[str] = mapped_column(String(20), default="pending")
    invoice_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    payment_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Relationships
    user: Mapped["UsersOrm"] = relationship("UsersOrm")
    items: Mapped[list["OrderItemOrm"]] = relationship(
        "OrderItemOrm", back_populates="order", lazy="selectin"
    )

    def __str__(self):
        return f"Order #{self.id} ({self.email})"


class OrderItemOrm(Base):
    """
    Represents an individual item within an order.
    Can be an original artwork or a specific print edition.
    """

    __tablename__ = "order_items"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[int] = mapped_column(Integer, ForeignKey("orders.id"))
    artwork_id: Mapped[int] = mapped_column(Integer, ForeignKey("artworks.id"))

    edition_type: Mapped[str] = mapped_column(String(20))  # 'original' or 'print'
    finish: Mapped[str] = mapped_column(String(50))  # 'Rolled' or 'Framed'
    size: Mapped[str | None] = mapped_column(String(50), nullable=True)

    price: Mapped[int] = mapped_column(Integer)

    # Relationships
    order: Mapped["OrdersOrm"] = relationship("OrdersOrm", back_populates="items")
    artwork: Mapped["ArtworksOrm"] = relationship("ArtworksOrm", lazy="selectin")
