from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel


class EditionType(str, Enum):
    ORIGINAL = "original"
    PRINT = "print"


class OrderItemBase(BaseModel):
    artwork_id: int
    edition_type: EditionType
    finish: str
    size: Optional[str] = None
    price: int


class OrderItem(OrderItemBase):
    id: int
    order_id: int


class OrderItemAdd(OrderItemBase):
    order_id: int


class OrderAddRequest(BaseModel):
    first_name: str
    last_name: str
    email: str
    phone: str
    newsletter_opt_in: bool = False
    discovery_source: Optional[str] = None
    promo_code: Optional[str] = None
    items: List[OrderItemBase]


class OrderAdd(OrderAddRequest):
    user_id: Optional[int] = None
    total_price: int


class Order(OrderAdd):
    id: int
    created_at: datetime
    items: List[OrderItem]


class OrderBulkRequest(OrderAdd):
    artwork_id: Optional[int] = None  # For legacy bulk compatibility


class OrderStatusUpdate(BaseModel):
    payment_status: str


Order.model_rebuild()
OrderBulkRequest.model_rebuild()
