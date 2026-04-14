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
    Specifies whether an item in the order is an original artwork or a print.
    """

    ORIGINAL = "original"
    PRINT = "print"


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
    Schema for updating the payment or processing status of an order.
    """

    payment_status: str


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
    newsletter_opt_in: Optional[bool] = None
    discovery_source: Optional[str] = None
    promo_code: Optional[str] = None
    invoice_id: Optional[str] = None
    payment_url: Optional[str] = None


Order.model_rebuild()
OrderBulkRequest.model_rebuild()
