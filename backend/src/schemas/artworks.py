"""
Pydantic schemas for artwork data validation and serialization.
"""

import enum
import re
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator

from src.schemas.labels import Label
from src.schemas.print_pricing import AspectRatioItem


class OriginalStatus(str, enum.Enum):
    """
    Allowed values for the status of an original artwork piece.
    Validated by Pydantic and stored as a string in the database.
    """

    AVAILABLE = "available"
    SOLD = "sold"
    RESERVED = "reserved"
    NOT_FOR_SALE = "not_for_sale"
    ON_EXHIBITION = "on_exhibition"
    ARCHIVED = "archived"
    DIGITAL = "digital"


class ArtworkAddRequest(BaseModel):
    """
    Schema for the initial artwork creation request from the frontend.
    Includes tag IDs for relationship management.
    """

    model_config = ConfigDict(use_enum_values=True)

    title: str = Field(..., description="Title of the artwork")
    description: str | None = Field(None, description="Description of the artwork")
    original_price: int | None = Field(None, description="Price of the original artwork in USD")
    original_status: OriginalStatus = Field(
        OriginalStatus.AVAILABLE,
        description="Status of the original: available, sold, or not_for_sale",
    )
    year: int | None = Field(None, description="Year created")
    style: str | None = Field(None, description="Artwork style")
    width_cm: float | None = Field(None, description="Width in cm")
    height_cm: float | None = Field(None, description="Height in cm")
    depth_cm: float | None = Field(None, description="Depth in cm")
    width_in: float | None = Field(None, description="Width in inches")
    height_in: float | None = Field(None, description="Height in inches")
    depth_in: float | None = Field(None, description="Depth in inches")
    orientation: str = Field(..., description="Orientation of the artwork")

    # ── Print availability flags ──────────────────────────────────────────────
    has_original: bool = Field(False, description="Original painting is offered for sale")
    has_canvas_print: bool = Field(False, description="Open edition canvas print available")
    has_canvas_print_limited: bool = Field(
        False, description="Limited edition canvas print available"
    )
    has_paper_print: bool = Field(False, description="Open edition paper print available")
    has_paper_print_limited: bool = Field(
        False, description="Limited edition paper print available"
    )
    canvas_print_limited_quantity: int | None = Field(
        None, description="Total number of prints in the canvas limited edition series (e.g. 30)"
    )
    paper_print_limited_quantity: int | None = Field(
        None, description="Total number of prints in the paper limited edition series (e.g. 30)"
    )

    # ── White border configuration ────────────────────────────────────────────
    white_border_pct: float = Field(
        5.0,
        ge=0.0,
        le=15.0,
        description="White border percentage for paper prints (recommended 5%)",
    )

    # ── Print configuration ────────────────────────────────────────────────────
    print_aspect_ratio_id: int | None = Field(
        None,
        description="ID of the normalized print aspect ratio family for this artwork",
    )

    labels: list[int] = Field([], description="List of label IDs")
    images: list[str | dict] | None = Field(
        None, description="Array of image URLs. The first image (index 0) is the main cover image."
    )
    print_quality_url: str | None = Field(None, description="High-res image URL for Prodigi")
    print_source_metadata: dict[str, Any] | None = Field(
        None,
        description="Derived metadata for the hi-res print source asset (pixels, DPI, ICC, etc.)",
    )
    print_profile_overrides: dict[str, Any] | None = Field(
        None,
        description="Per-artwork overrides for Prodigi print-profile recommendations.",
    )
    print_workflow_config: dict[str, Any] | None = Field(
        None,
        description="Provider-neutral admin workflow settings and approval flags.",
    )
    show_in_gallery: bool = Field(True, description="Artwork appears in the public gallery")
    show_in_shop: bool = Field(True, description="Artwork can appear in the public shop")


class ArtworkAdd(BaseModel):
    """
    Schema for adding an artwork record to the database.
    Includes the auto-generated slug.
    """

    title: str = Field(..., description="Title of the artwork")
    slug: str | None = Field(None, description="Unique slug for the artwork")
    description: str | None = Field(None, description="Description of the artwork")
    original_price: int | None = Field(None, description="Price of the original artwork in USD")
    original_status: OriginalStatus = Field(
        OriginalStatus.AVAILABLE,
        description="Status of the original: available, sold, or not_for_sale",
    )
    year: int | None = Field(None)
    style: str | None = Field(None)
    width_cm: float | None = Field(None)
    height_cm: float | None = Field(None)
    depth_cm: float | None = Field(None)
    width_in: float | None = Field(None)
    height_in: float | None = Field(None)
    depth_in: float | None = Field(None)
    orientation: str = Field(..., description="Orientation of the artwork")
    images: list[str | dict] | None = Field(
        None, description="Array of image URLs. The first image (index 0) is the main cover image."
    )
    print_quality_url: str | None = Field(None)
    print_source_metadata: dict[str, Any] | None = Field(None)
    print_profile_overrides: dict[str, Any] | None = Field(None)
    print_workflow_config: dict[str, Any] | None = Field(None)
    show_in_gallery: bool = Field(True)
    show_in_shop: bool = Field(True)

    # Print availability flags
    has_original: bool = Field(False)
    has_canvas_print: bool = Field(False)
    has_canvas_print_limited: bool = Field(False)
    has_paper_print: bool = Field(False)
    has_paper_print_limited: bool = Field(False)
    canvas_print_limited_quantity: int | None = Field(None)
    paper_print_limited_quantity: int | None = Field(None)

    # White border configuration
    white_border_pct: float = Field(5.0)

    # Print configuration
    print_aspect_ratio_id: int | None = Field(None)


class Artwork(ArtworkAdd):
    """
    Represents a full artwork entity retrieved from the database.
    """

    id: int = Field(..., description="ID of the artwork")
    slug: str | None = Field(None, description="Unique slug for the artwork")

    @model_validator(mode="after")
    def ensure_slug(self) -> "Artwork":
        """Back-fill slug from title for legacy rows that were saved without one."""
        if not self.slug and self.title:
            self.slug = re.sub(r"[^a-z0-9]+", "-", self.title.lower()).strip("-")
        return self


class ArtworkWithLabels(Artwork):
    """
    Represents an artwork entity including its associated labels and print ratio info.
    """

    labels: list[Label]
    images: list[str | dict] | None = Field(
        None, description="Array of image URLs or image objects."
    )
    # White border configuration
    white_border_pct: float = 5.0
    # Nested aspect ratio object (serialized from the SQLAlchemy relationship)
    print_aspect_ratio: AspectRatioItem | None = None
    print_source_metadata: dict[str, Any] | None = None
    print_profile_overrides: dict[str, Any] | None = None
    print_workflow_config: dict[str, Any] | None = None
    print_readiness_summary: dict[str, Any] | None = None

    model_config = ConfigDict(from_attributes=True)


class ArtworkPatchRequest(BaseModel):
    """
    Schema for partial artwork update requests from the frontend.
    """

    title: str | None = Field(None, description="Title of the artwork")
    description: str | None = Field(None, description="Description of the artwork")
    original_price: int | None = Field(None, description="Price of the original artwork in USD")
    original_status: OriginalStatus | None = Field(
        None, description="Status of the original: available, sold, or not_for_sale"
    )
    year: int | None = Field(None)
    style: str | None = Field(None)
    width_cm: float | None = Field(None)
    height_cm: float | None = Field(None)
    depth_cm: float | None = Field(None)
    width_in: float | None = Field(None)
    height_in: float | None = Field(None)
    depth_in: float | None = Field(None)
    orientation: str | None = Field(None, description="Orientation of the artwork")

    # Print availability flags (all optional for partial updates)
    has_original: bool | None = Field(None)
    has_canvas_print: bool | None = Field(None)
    has_canvas_print_limited: bool | None = Field(None)
    has_paper_print: bool | None = Field(None)
    has_paper_print_limited: bool | None = Field(None)
    canvas_print_limited_quantity: int | None = Field(None)
    paper_print_limited_quantity: int | None = Field(None)

    # White border configuration
    white_border_pct: float | None = Field(None, ge=0.0, le=15.0)

    # Print configuration (optional for partial updates)
    print_aspect_ratio_id: int | None = Field(None)

    labels: list[int] = Field([], description="List of label IDs")
    images: list[str | dict] | None = Field(
        None, description="Array of image URLs. The first image (index 0) is the main cover image."
    )
    print_quality_url: str | None = Field(None, description="High-res image URL for Prodigi")
    print_source_metadata: dict[str, Any] | None = Field(
        None,
        description="Derived metadata for the hi-res print source asset (pixels, DPI, ICC, etc.)",
    )
    print_profile_overrides: dict[str, Any] | None = Field(
        None,
        description="Per-artwork overrides for Prodigi print-profile recommendations.",
    )
    print_workflow_config: dict[str, Any] | None = Field(
        None,
        description="Provider-neutral admin workflow settings and approval flags.",
    )
    show_in_gallery: bool | None = Field(None)
    show_in_shop: bool | None = Field(None)


class ArtworkPatch(BaseModel):
    """
    Schema for applying partial updates to an artwork record in the database.
    """

    model_config = ConfigDict(use_enum_values=True)

    title: str | None = Field(None)
    slug: str | None = Field(None)
    description: str | None = Field(None)
    original_price: int | None = Field(None)
    original_status: OriginalStatus | None = Field(None)
    year: int | None = Field(None)
    style: str | None = Field(None)
    width_cm: float | None = Field(None)
    height_cm: float | None = Field(None)
    depth_cm: float | None = Field(None)
    width_in: float | None = Field(None)
    height_in: float | None = Field(None)
    depth_in: float | None = Field(None)
    orientation: str | None = Field(None)
    images: list[str | dict] | None = Field(None)
    print_quality_url: str | None = Field(None)
    print_source_metadata: dict[str, Any] | None = Field(None)
    print_profile_overrides: dict[str, Any] | None = Field(None)
    print_workflow_config: dict[str, Any] | None = Field(None)
    show_in_gallery: bool | None = Field(None)
    show_in_shop: bool | None = Field(None)

    # Print availability flags
    has_original: bool | None = Field(None)
    has_canvas_print: bool | None = Field(None)
    has_canvas_print_limited: bool | None = Field(None)
    has_paper_print: bool | None = Field(None)
    has_paper_print_limited: bool | None = Field(None)
    canvas_print_limited_quantity: int | None = Field(None)
    paper_print_limited_quantity: int | None = Field(None)

    # White border configuration
    white_border_pct: float | None = Field(None)

    # Print configuration
    print_aspect_ratio_id: int | None = Field(None)


class ArtworkAddBulk(BaseModel):
    """
    Schema for high-performance bulk artwork creation.
    """

    model_config = ConfigDict(use_enum_values=True)

    title: str = Field(..., description="Title of the artwork")
    description: str | None = Field(None)
    original_price: int | None = Field(None)
    original_status: OriginalStatus = Field(OriginalStatus.AVAILABLE)
    orientation: str = Field(..., description="Orientation of the artwork")
    images: list[str | dict] | None = Field(None)
    print_quality_url: str | None = Field(None)
    show_in_gallery: bool = Field(True)
    show_in_shop: bool = Field(True)

    # Print availability flags
    has_original: bool = Field(False)
    has_canvas_print: bool = Field(False)
    has_canvas_print_limited: bool = Field(False)
    has_paper_print: bool = Field(False)
    has_paper_print_limited: bool = Field(False)
    canvas_print_limited_quantity: int | None = Field(None)
    paper_print_limited_quantity: int | None = Field(None)
