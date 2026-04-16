"""
Pydantic schemas for artwork label and category data validation.
"""

from pydantic import BaseModel, Field


class LabelCategoryAdd(BaseModel):
    title: str = Field(..., description="Title of the category")
    accent_color: str | None = Field(None, description="Optional color for the UI")


class LabelCategory(LabelCategoryAdd):
    id: int


class LabelAdd(BaseModel):
    """
    Schema for creating a new label.
    """

    title: str = Field(..., description="Title of the label")
    category_id: int | None = Field(None, description="Category ID")


class Label(LabelAdd):
    """
    Represents a full label entity retrieved from the database.
    """

    id: int = Field(..., description="ID of the label")


class ArtworkLabelAdd(BaseModel):
    """
    Schema for associating a label with an artwork.
    """

    label_id: int = Field(..., description="ID of the label")
    artwork_id: int = Field(..., description="ID of the artwork")


class ArtworkLabel(ArtworkLabelAdd):
    id: int = Field(..., description="ID of the artwork label")
