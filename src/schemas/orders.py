from pydantic import BaseModel, Field
from datetime import datetime
from enum import Enum


class EditionType(str, Enum):
    ORIGINAL = "original"
    PRINT = "print"


class OrderAddRequest(BaseModel):
    artwork_id: int = Field(..., description="ID of the artwork")
    edition_type: EditionType = Field(..., description="Type of edition being purchased")


class OrderAdd(OrderAddRequest):
    user_id: int = Field(..., description="ID of the user")
    price: int = Field(..., description="Price of the order")


class Order(OrderAdd):
    id: int = Field(..., description="ID of the order")


class OrderBulkRequest(BaseModel):
    """Schema for bulk order with all fields"""

    user_id: int
    artwork_id: int
    edition_type: EditionType
    price: int
