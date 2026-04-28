"""Pydantic schemas for normalized print aspect ratios."""

from pydantic import BaseModel, Field


class AspectRatioCreate(BaseModel):
    """Schema for creating a normalized print aspect ratio category."""

    label: str = Field(..., min_length=1, max_length=20, description='e.g. "3:4"')
    description: str | None = Field(None, max_length=200, description='e.g. "Portrait (A4 family)"')
    sort_order: int = Field(0, ge=0, description="Display order in admin UI (lower = first)")


class AspectRatioUpdate(BaseModel):
    """Schema for updating an existing print aspect ratio category."""

    label: str | None = Field(None, min_length=1, max_length=20)
    description: str | None = Field(None, max_length=200)
    sort_order: int | None = Field(None, ge=0)


class AspectRatioItem(BaseModel):
    """
    Read schema for a normalized aspect ratio category.
    Returned by GET /print-pricing/aspect-ratios.
    """

    id: int
    label: str
    description: str | None = None
    sort_order: int

    model_config = {"from_attributes": True}
