from pydantic import BaseModel, Field
from datetime import datetime


class OrderAddRequest(BaseModel):
    artwork_id: int = Field(..., description="ID of the artwork")


class OrderAdd(OrderAddRequest):
    collection_id: int = Field(..., description="ID of the collection")
    user_id: int = Field(..., description="ID of the user")
    price: int = Field(..., description="Price of the order")


class Order(OrderAdd):
    id: int = Field(..., description="ID of the order")


class OrderBulkRequest(BaseModel):
    """Schema for bulk order with all fields"""

    user_id: int
    collection_id: int
    artwork_id: int
    price: int
