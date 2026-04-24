"""
Pydantic schemas for normalized print aspect ratios and legacy manual pricing rows.

Aspect ratios remain part of the active artwork and print-workflow contract.
Manual pricing rows are kept only for compatibility and non-runtime tooling.
"""

import enum

from pydantic import BaseModel, Field


class PrintType(str, enum.Enum):
    """All available legacy manual print pricing types."""

    CANVAS = "canvas"
    CANVAS_LIMITED = "canvas_limited"
    PAPER = "paper"
    PAPER_LIMITED = "paper_limited"

    @property
    def label(self) -> str:
        """Human-readable label for admin UI display."""
        return {
            "canvas": "Canvas Print",
            "canvas_limited": "Canvas Print - Limited Edition",
            "paper": "Paper Print",
            "paper_limited": "Paper Print - Limited Edition",
        }[self.value]


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


class PrintPricingItem(BaseModel):
    """Represents a single legacy manual pricing entry."""

    id: int
    aspect_ratio_id: int
    print_type: PrintType
    size_label: str = Field(description='e.g. "30x40 cm"')
    price: int = Field(description="Price in whole USD", gt=0)

    model_config = {"from_attributes": True}


class PrintPricingCreate(BaseModel):
    """Schema for adding a legacy manual pricing row."""

    aspect_ratio_id: int = Field(..., description="ID of the parent aspect ratio")
    print_type: PrintType
    size_label: str = Field(..., min_length=1, max_length=50)
    price: int = Field(..., gt=0)


class PrintPricingUpdate(BaseModel):
    """Schema for updating an existing legacy manual pricing row."""

    size_label: str | None = Field(None, min_length=1, max_length=50)
    price: int | None = Field(None, gt=0)
