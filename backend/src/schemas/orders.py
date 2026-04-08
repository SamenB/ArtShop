"""
Pydantic schemas for order data validation and serialization.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel


class EditionType(str, Enum):
    """
    Specifies whether an item in the order is an original artwork or a print.
    """

    ORIGINAL = "original"
    PRINT = "print"


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


class OrderItemAdd(OrderItemBase):
    """
    Schema for adding an order item to the database.
    """

    order_id: int


class OrderAddRequest(BaseModel):
    """
    Schema for the initial checkout request from the frontend.
    """

    first_name: str
    last_name: str
    email: str
    phone: str
    newsletter_opt_in: bool = False
    discovery_source: Optional[str] = None
    promo_code: Optional[str] = None
    items: List[OrderItemBase]


class OrderAdd(OrderAddRequest):
    """
    Schema for creating a full order record in the database.
    """

    user_id: Optional[int] = None
    total_price: int


class Order(OrderAdd):
    """
    Represents a full order entity retrieved from the database.
    """

    id: int
    created_at: datetime
    items: List[OrderItem]


class OrderBulkRequest(OrderAdd):
    """
    Extended schema for bulk order operations.
    """

    artwork_id: Optional[int] = None  # For legacy bulk compatibility


class OrderStatusUpdate(BaseModel):
    """
    Schema for updating the payment or processing status of an order.
    """

    payment_status: str


Order.model_rebuild()
OrderBulkRequest.model_rebuild()
