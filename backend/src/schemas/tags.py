"""
Pydantic schemas for artwork tag data validation.
"""

from pydantic import BaseModel, Field


class TagAdd(BaseModel):
    """
    Schema for creating a new tag.
    """

    title: str = Field(..., description="Title of the tag")
    category: str | None = Field(None, description="Category: 'medium' or 'general'")


class Tag(TagAdd):
    """
    Represents a full tag entity retrieved from the database.
    """

    id: int = Field(..., description="ID of the tag")


class ArtworkTagAdd(BaseModel):
    """
    Schema for associating a tag with an artwork.
    """

    tag_id: int = Field(..., description="ID of the tag")
    artwork_id: int = Field(..., description="ID of the artwork")


class ArtworkTag(ArtworkTagAdd):
    """
    Represents an artwork-tag association retrieved from the database.
    """

    id: int = Field(..., description="ID of the artwork tag")
