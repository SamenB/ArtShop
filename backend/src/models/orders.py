"""
SQLAlchemy database models for orders and their constituent items.
"""

from datetime import datetime

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.database import Base


class OrdersOrm(Base):
    """
    Represents a customer order.

    Tracks two independent status axes:
    - payment_status: reflects the payment gateway state (auto-updated by Monobank webhook).
    - fulfillment_status: reflects the physical order pipeline (manually updated by admin).
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
    subtotal_price: Mapped[int | None] = mapped_column(Integer, nullable=True)
    shipping_price: Mapped[int | None] = mapped_column(Integer, nullable=True)
    discount_price: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_price: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())

    # ── Payment Status ──────────────────────────────────────────────────────────
    # Auto-managed by Monobank webhook. Do not change manually unless necessary.
    # Values: pending | awaiting_payment | paid | failed | refunded | hold | mock_paid
    payment_status: Mapped[str] = mapped_column(String(20), default="pending")
    invoice_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    payment_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # ── Fulfillment Status ──────────────────────────────────────────────────────
    # Manually managed by admin via the dashboard.
    # Values: pending | confirmed | print_ordered | print_received | packaging | shipped | delivered | cancelled
    fulfillment_status: Mapped[str] = mapped_column(String(30), default="pending")

    # Internal admin notes (not visible to customers)
    notes: Mapped[str | None] = mapped_column(String(2000), nullable=True)

    # ── Shipping Tracking ───────────────────────────────────────────────────────
    tracking_number: Mapped[str | None] = mapped_column(String(200), nullable=True)
    carrier: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # Auto-generated from carrier+tracking_number or set manually
    tracking_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # ── Lifecycle Timestamps ────────────────────────────────────────────────────
    # Automatically set by OrderService.update_fulfillment_status() on each transition.
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    print_ordered_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    print_received_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    shipped_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

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
    Supports all edition types: original, canvas print, limited canvas,
    paper print, and limited paper print.
    """

    __tablename__ = "order_items"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[int] = mapped_column(Integer, ForeignKey("orders.id"))
    artwork_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("artworks.id", ondelete="SET NULL"), nullable=True
    )

    # Edition type — one of EditionType enum values (String(30) to accommodate all variants)
    # original | canvas_print | canvas_print_limited | paper_print | paper_print_limited
    edition_type: Mapped[str] = mapped_column(String(30))
    finish: Mapped[str] = mapped_column(String(50))  # 'Rolled' | 'Framed' | 'Unframed' | etc.
    size: Mapped[str | None] = mapped_column(String(50), nullable=True)

    price: Mapped[int] = mapped_column(Integer)
    customer_product_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    customer_shipping_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    customer_line_total: Mapped[float | None] = mapped_column(Float, nullable=True)
    customer_currency: Mapped[str | None] = mapped_column(String(3), nullable=True)

    # Relationships
    order: Mapped["OrdersOrm"] = relationship("OrdersOrm", back_populates="items")
    artwork: Mapped["ArtworksOrm"] = relationship("ArtworksOrm", lazy="selectin")

    # Prodigi Print-on-Demand Fields
    prodigi_storefront_offer_size_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    prodigi_sku: Mapped[str | None] = mapped_column(String(100), nullable=True)
    prodigi_category_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    prodigi_slot_size_label: Mapped[str | None] = mapped_column(String(80), nullable=True)
    prodigi_attributes: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    prodigi_storefront_bake_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    prodigi_storefront_policy_version: Mapped[str | None] = mapped_column(
        String(80), nullable=True
    )
    prodigi_shipping_tier: Mapped[str | None] = mapped_column(String(50), nullable=True)
    prodigi_shipping_method: Mapped[str | None] = mapped_column(String(50), nullable=True)
    prodigi_delivery_days: Mapped[str | None] = mapped_column(String(40), nullable=True)
    prodigi_order_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    prodigi_status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    prodigi_wholesale_eur: Mapped[float | None] = mapped_column(Float, nullable=True)
    prodigi_shipping_eur: Mapped[float | None] = mapped_column(Float, nullable=True)
    prodigi_supplier_total_eur: Mapped[float | None] = mapped_column(Float, nullable=True)
    prodigi_retail_eur: Mapped[float | None] = mapped_column(Float, nullable=True)
    prodigi_supplier_currency: Mapped[str | None] = mapped_column(String(3), nullable=True)
    prodigi_destination_country_code: Mapped[str | None] = mapped_column(String(2), nullable=True)
