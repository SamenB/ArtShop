"""
Pydantic schemas for print pricing and aspect ratio data validation and serialization.

Hierarchy:
    PrintAspectRatioCreate / PrintAspectRatioUpdate  — CRUD for ratio categories.
    PrintAspectRatio                                 — Full read schema (includes price rows).
    PrintPricingItem                                 — Single size→price entry.
    PrintPricingCreate / PrintPricingUpdate          — CRUD for pricing entries.
    PrintPricingGrouped                              — Convenience schema used by the shop frontend.
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


# ── Aspect Ratio schemas ──────────────────────────────────────────────────────

class AspectRatioCreate(BaseModel):
    """Schema for creating a new print aspect ratio category."""

    label: str = Field(..., min_length=1, max_length=20, description='e.g. "3:4"')
    description: str | None = Field(None, max_length=200, description='e.g. "Portrait (A4 family)"')
    sort_order: int = Field(0, ge=0, description="Display order in admin UI (lower = first)")


class AspectRatioUpdate(BaseModel):
    """Schema for updating an existing aspect ratio category."""

    label: str | None = Field(None, min_length=1, max_length=20)
    description: str | None = Field(None, max_length=200)
    sort_order: int | None = Field(None, ge=0)


class AspectRatioItem(BaseModel):
    """
    Read schema for an aspect ratio category.
    Returned by GET /print-pricing/aspect-ratios.
    Does NOT include nested pricing rows (use AspectRatioWithPricing for that).
    """

    id: int
    label: str
    description: str | None = None
    sort_order: int

    model_config = {"from_attributes": True}


class AspectRatioWithPricing(BaseModel):
    """
    Full read schema for an aspect ratio, including all nested pricing rows.
    Used by the admin Print Pricing tab to render the full grouped grid.
    """

    id: int
    label: str
    description: str | None = None
    sort_order: int
    pricing_rows: list["PrintPricingItem"] = []

    model_config = {"from_attributes": True}


# ── Print Pricing schemas ─────────────────────────────────────────────────────

class PrintPricingItem(BaseModel):
    """
    Represents a single entry in the print pricing grid.
    """

    id: int
    aspect_ratio_id: int
    print_type: PrintType
    size_label: str = Field(description='e.g. "30×40 cm"')
    price: int = Field(description="Price in whole USD", gt=0)

    model_config = {"from_attributes": True}


class PrintPricingCreate(BaseModel):
    """Schema for adding a new pricing row."""

    aspect_ratio_id: int = Field(..., description="ID of the parent aspect ratio")
    print_type: PrintType
    size_label: str = Field(..., min_length=1, max_length=50)
    price: int = Field(..., gt=0)


class PrintPricingUpdate(BaseModel):
    """Schema for updating an existing pricing row."""

    size_label: str | None = Field(None, min_length=1, max_length=50)
    price: int | None = Field(None, gt=0)


# Rebuild forward reference
AspectRatioWithPricing.model_rebuild()
