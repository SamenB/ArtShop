"""
Pydantic schemas for artwork collection data validation.
"""

from pydantic import BaseModel, ConfigDict, Field


class CollectionAdd(BaseModel):
    """
    Schema for creating a new artwork collection.
    """

    title: str = Field(..., description="Title of the collection")
    bg_color: str | None = Field(
        None, description="Hex color code for collection background gradient"
    )


class CollectionPatch(BaseModel):
    """
    Schema for partial updates to an existing collection.
    """

    title: str | None = Field(None, description="Title of the collection")
    bg_color: str | None = Field(
        None, description="Hex color code for collection background gradient"
    )


class Collection(CollectionAdd):
    """
    Represents a full collection entity retrieved from the database.
    """

    id: int = Field(..., description="ID of the collection")

    model_config = ConfigDict(from_attributes=True)
