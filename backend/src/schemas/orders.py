"""
Pydantic schemas for order data validation and serialization.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator


class EditionType(str, Enum):
    """
    Specifies the edition type of an item in the order.

    Supports five distinct product types:
        original              — One-of-a-kind original artwork
        canvas_print          — Open edition canvas print
        canvas_print_limited  — Signed & numbered limited edition canvas print
        paper_print           — Open edition paper print
        paper_print_limited   — Signed & numbered limited edition paper print
    """

    ORIGINAL = "original"
    CANVAS_PRINT = "canvas_print"
    CANVAS_PRINT_LIMITED = "canvas_print_limited"
    PAPER_PRINT = "paper_print"
    PAPER_PRINT_LIMITED = "paper_print_limited"

    @property
    def label(self) -> str:
        """Human-readable label for admin UI and customer emails."""
        return {
            "original": "Original",
            "canvas_print": "Canvas Print",
            "canvas_print_limited": "Canvas Print — Limited Edition",
            "paper_print": "Paper Print",
            "paper_print_limited": "Paper Print — Limited Edition",
        }[self.value]

    @property
    def is_print(self) -> bool:
        """Returns True for all non-original edition types."""
        return self != EditionType.ORIGINAL

    @property
    def artwork_availability_flag(self) -> str:
        """Returns the corresponding ArtworksOrm boolean field name."""
        return {
            "original": "has_original",
            "canvas_print": "has_canvas_print",
            "canvas_print_limited": "has_canvas_print_limited",
            "paper_print": "has_paper_print",
            "paper_print_limited": "has_paper_print_limited",
        }[self.value]


class FulfillmentStatus(str, Enum):
    """
    Tracks the physical fulfillment pipeline for an order.
    Updated manually by the admin via the dashboard.

    Flow:
        pending → confirmed → print_ordered → print_received → packaging → shipped → delivered
        (any stage) → cancelled
    """

    PENDING = "pending"  # Order received, payment not yet confirmed
    CONFIRMED = "confirmed"  # Payment confirmed, starting to process
    PRINT_ORDERED = "print_ordered"  # Sent to print shop (you paid)
    PRINT_RECEIVED = "print_received"  # Print shop sent the artwork back to you
    PACKAGING = "packaging"  # You are packaging the parcel
    SHIPPED = "shipped"  # Parcel dispatched to client (TTN available)
    DELIVERED = "delivered"  # Client confirmed receipt (optional)
    CANCELLED = "cancelled"  # Order cancelled at any stage


# Carriers with known tracking URL templates.
# {tracking_number} is replaced by the actual number.
CARRIER_TRACKING_URLS: dict[str, str] = {
    "nova_poshta": "https://tracking.novaposhta.ua/#/uk/{tracking_number}",
    "ukrposhta": "https://track.ukrposhta.ua/tracking_UA.html?barcode={tracking_number}",
    "dhl": "https://www.dhl.com/global-en/home/tracking/tracking-express.html?submit=1&tracking-id={tracking_number}",
    "fedex": "https://www.fedex.com/apps/fedextrack/?action=track&tracknumbers={tracking_number}",
    "ups": "https://www.ups.com/track?tracknum={tracking_number}",
    "meest": "https://m.meest-group.com/en/track/{tracking_number}",
}


def build_tracking_url(carrier: str | None, tracking_number: str | None) -> str | None:
    """Auto-generate a tracking URL for known carriers."""
    if not carrier or not tracking_number:
        return None
    template = CARRIER_TRACKING_URLS.get(carrier.lower().replace(" ", "_").replace("-", "_"))
    if template:
        return template.replace("{tracking_number}", tracking_number.strip())
    return None


class ArtworkSummary(BaseModel):
    """
    Lightweight summary of an artwork for inclusion in orders.
    """

    id: int
    title: str
    images: Optional[List[str | dict]] = None


class OrderItemBase(BaseModel):
    """
    Base schema for individual items within an order.
    """

    artwork_id: int
    edition_type: EditionType
    finish: str
    size: Optional[str] = None
    price: int

    # Prodigi Print-on-Demand Fields
    prodigi_sku: Optional[str] = None
    prodigi_attributes: Optional[dict] = None
    prodigi_shipping_method: Optional[str] = None
    prodigi_order_id: Optional[str] = None
    prodigi_status: Optional[str] = None
    prodigi_wholesale_eur: Optional[float] = None
    prodigi_shipping_eur: Optional[float] = None
    prodigi_retail_eur: Optional[float] = None


class OrderItem(OrderItemBase):
    """
    Represents an individual order item as stored in the database.
    """

    id: int
    order_id: int
    artwork: Optional[ArtworkSummary] = None


class OrderItemAdd(OrderItemBase):
    """
    Schema for adding an order item to the database.
    """

    order_id: int


class OrderAddRequest(BaseModel):
    """
    Schema for the initial checkout request from the frontend.
    Includes contact information and shipping address for worldwide delivery.
    """

    # Contact info
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    email: str = Field(..., min_length=5, max_length=200)
    phone: str = Field(..., min_length=7, max_length=50)

    # Shipping address (required for delivery)
    shipping_country: str = Field(..., min_length=2, max_length=100)
    shipping_country_code: str = Field(
        ...,
        min_length=2,
        max_length=2,
        description="ISO 3166-1 alpha-2 country code (e.g. 'US', 'UA', 'DE')",
    )
    shipping_city: str = Field(..., min_length=1, max_length=200)
    shipping_address_line1: str = Field(..., min_length=1, max_length=500)
    shipping_postal_code: str = Field(..., min_length=1, max_length=20)

    # Optional shipping fields
    shipping_state: Optional[str] = Field(None, max_length=100)
    shipping_address_line2: Optional[str] = Field(None, max_length=500)
    shipping_phone: Optional[str] = Field(None, max_length=50)
    shipping_notes: Optional[str] = Field(None, max_length=1000)

    # Marketing & Discovery
    newsletter_opt_in: bool = False
    discovery_source: Optional[str] = None
    promo_code: Optional[str] = None

    # Cart items
    items: List[OrderItemBase]

    @field_validator("shipping_country_code")
    @classmethod
    def validate_country_code(cls, v: str | None) -> str | None:
        """Ensure country code is uppercase 2-letter ISO 3166-1 alpha-2."""
        if v is None:
            return v
        v = v.strip().upper()
        if len(v) != 2 or not v.isalpha():
            raise ValueError(
                "Country code must be exactly 2 uppercase letters (ISO 3166-1 alpha-2)"
            )
        return v


class OrderAdd(OrderAddRequest):
    """
    Schema for creating a full order record in the database.
    """

    user_id: Optional[int] = None
    total_price: int


class Order(OrderAdd):
    """
    Represents a full order entity retrieved from the database.
    Shipping fields are overridden as Optional to handle legacy orders
    created before shipping address was required.
    """

    id: int
    created_at: datetime
    items: List[OrderItem]

    # Payment tracking
    payment_status: str = "pending"
    invoice_id: Optional[str] = None
    payment_url: Optional[str] = None

    # Fulfillment tracking
    fulfillment_status: Optional[str] = FulfillmentStatus.PENDING

    # Internal admin notes
    notes: Optional[str] = None

    # Shipping tracking
    tracking_number: Optional[str] = None
    carrier: Optional[str] = None
    tracking_url: Optional[str] = None

    # Lifecycle timestamps
    confirmed_at: Optional[datetime] = None
    print_ordered_at: Optional[datetime] = None
    print_received_at: Optional[datetime] = None
    shipped_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None

    # Override required shipping fields for backward compatibility with legacy orders
    shipping_country: Optional[str] = None  # type: ignore[assignment]
    shipping_country_code: Optional[str] = None  # type: ignore[assignment]
    shipping_city: Optional[str] = None  # type: ignore[assignment]
    shipping_address_line1: Optional[str] = None  # type: ignore[assignment]
    shipping_postal_code: Optional[str] = None  # type: ignore[assignment]


class OrderBulkRequest(OrderAdd):
    """
    Extended schema for bulk order operations.
    """

    artwork_id: Optional[int] = None  # For legacy bulk compatibility
    # Shipping fields are optional for bulk/legacy imports
    shipping_country: Optional[str] = None  # type: ignore[assignment]
    shipping_country_code: Optional[str] = None  # type: ignore[assignment]
    shipping_city: Optional[str] = None  # type: ignore[assignment]
    shipping_address_line1: Optional[str] = None  # type: ignore[assignment]
    shipping_postal_code: Optional[str] = None  # type: ignore[assignment]


class OrderStatusUpdate(BaseModel):
    """
    Schema for updating the payment status of an order (admin only).
    """

    payment_status: str


class FulfillmentStatusUpdate(BaseModel):
    """
    Schema for updating the fulfillment status of an order (admin only).
    Optionally includes tracking details when transitioning to 'shipped'.
    """

    fulfillment_status: FulfillmentStatus
    tracking_number: Optional[str] = Field(None, max_length=200)
    carrier: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = Field(None, max_length=2000)


class OrderPatch(BaseModel):
    """
    Schema for administrative partial updates to an order.
    """

    first_name: Optional[str] = Field(None, min_length=1, max_length=100)
    last_name: Optional[str] = Field(None, min_length=1, max_length=100)
    email: Optional[str] = Field(None, min_length=5, max_length=200)
    phone: Optional[str] = Field(None, min_length=7, max_length=50)

    # Shipping fields
    shipping_country: Optional[str] = Field(None, max_length=100)
    shipping_country_code: Optional[str] = Field(None, min_length=2, max_length=2)
    shipping_state: Optional[str] = Field(None, max_length=100)
    shipping_city: Optional[str] = Field(None, max_length=200)
    shipping_address_line1: Optional[str] = Field(None, max_length=500)
    shipping_address_line2: Optional[str] = Field(None, max_length=500)
    shipping_postal_code: Optional[str] = Field(None, max_length=20)
    shipping_phone: Optional[str] = Field(None, max_length=50)
    shipping_notes: Optional[str] = Field(None, max_length=1000)

    # Meta
    payment_status: Optional[str] = None
    fulfillment_status: Optional[str] = None
    newsletter_opt_in: Optional[bool] = None
    discovery_source: Optional[str] = None
    promo_code: Optional[str] = None
    invoice_id: Optional[str] = None
    payment_url: Optional[str] = None

    # Fulfillment
    notes: Optional[str] = None
    tracking_number: Optional[str] = None
    carrier: Optional[str] = None
    tracking_url: Optional[str] = None


Order.model_rebuild()
OrderBulkRequest.model_rebuild()
