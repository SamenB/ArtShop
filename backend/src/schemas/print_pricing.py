"""
Pydantic schemas for print pricing data validation and serialization.
"""

import enum

from pydantic import BaseModel, Field


class PrintType(str, enum.Enum):
    """All available print format types."""

    CANVAS = "canvas"
    CANVAS_LIMITED = "canvas_limited"
    PAPER = "paper"
    PAPER_LIMITED = "paper_limited"

    @property
    def label(self) -> str:
        """Human-readable label for admin UI display."""
        return {
            "canvas": "Canvas Print",
            "canvas_limited": "Canvas Print — Limited Edition",
            "paper": "Paper Print",
            "paper_limited": "Paper Print — Limited Edition",
        }[self.value]


class PrintPricingItem(BaseModel):
    """
    Represents a single entry in the print pricing grid.
    """

    id: int
    print_type: PrintType
    size_label: str = Field(description='e.g. "30×40 cm"')
    price: int = Field(description="Price in whole USD", gt=0)

    model_config = {"from_attributes": True}


class PrintPricingCreate(BaseModel):
    """Schema for adding a new pricing row."""

    print_type: PrintType
    size_label: str = Field(..., min_length=1, max_length=50)
    price: int = Field(..., gt=0)


class PrintPricingUpdate(BaseModel):
    """Schema for updating an existing pricing row."""

    size_label: str | None = Field(None, min_length=1, max_length=50)
    price: int | None = Field(None, gt=0)
