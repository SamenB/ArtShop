from pydantic import BaseModel, Field
from src.schemas.tags import Tag


class ArtworkAddRequest(BaseModel):
    title: str = Field(..., description="Title of the artwork")
    description: str | None = Field(None, description="Description of the artwork")
    price: int = Field(..., description="Price of the artwork")
    quantity: int = Field(..., description="Quantity of the artwork")
    tags: list[int] = Field([], description="List of tag IDs")


class ArtworkAdd(BaseModel):
    title: str = Field(..., description="Title of the artwork")
    description: str | None = Field(None, description="Description of the artwork")
    price: int = Field(..., description="Price of the artwork")
    quantity: int = Field(..., description="Quantity of the artwork")
    collection_id: int = Field(..., description="ID of the collection")


class Artwork(ArtworkAdd):
    id: int = Field(..., description="ID of the artwork")


class ArtworkWithTags(Artwork):
    tags: list[Tag]


class ArtworkPatchRequest(BaseModel):
    title: str | None = Field(None, description="Title of the artwork")
    description: str | None = Field(None, description="Description of the artwork")
    price: int | None = Field(None, description="Price of the artwork")
    quantity: int | None = Field(None, description="Quantity of the artwork")
    tags: list[int] = Field([], description="List of tag IDs")


class ArtworkPatch(BaseModel):
    collection_id: int | None = Field(None, description="ID of the collection")
    title: str | None = Field(None, description="Title of the artwork")
    description: str | None = Field(None, description="Description of the artwork")
    price: int | None = Field(None, description="Price of the artwork")
    quantity: int | None = Field(None, description="Quantity of the artwork")


class ArtworkAddBulk(BaseModel):
    """Schema for bulk artwork creation with collection_id in body"""

    collection_id: int = Field(..., description="ID of the collection")
    title: str = Field(..., description="Title of the artwork")
    description: str | None = Field(None, description="Description of the artwork")
    price: int = Field(..., description="Price of the artwork")
    quantity: int = Field(..., description="Quantity of the artwork")
