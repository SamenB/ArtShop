import enum

from pydantic import BaseModel, Field

from src.schemas.tags import Tag


class OriginalStatus(str, enum.Enum):
    """Allowed values for original artwork status — validated by Pydantic, stored as plain string in DB"""

    AVAILABLE = "available"
    SOLD = "sold"
    RESERVED = "reserved"
    NOT_FOR_SALE = "not_for_sale"
    ON_EXHIBITION = "on_exhibition"
    ARCHIVED = "archived"
    DIGITAL = "digital"


class ArtworkAddRequest(BaseModel):
    title: str = Field(..., description="Title of the artwork")
    description: str | None = Field(None, description="Description of the artwork")
    original_price: int | None = Field(None, description="Price of the original artwork")
    original_status: OriginalStatus = Field(
        OriginalStatus.AVAILABLE,
        description="Status of the original: available, sold, or not_for_sale",
    )
    year: int | None = Field(None, description="Year established")
    materials: str | None = Field(None, description="Materials used")
    style: str | None = Field(None, description="Artwork style")
    width_cm: float | None = Field(None, description="Width in cm")
    height_cm: float | None = Field(None, description="Height in cm")
    depth_cm: float | None = Field(None, description="Depth in cm")
    width_in: float | None = Field(None, description="Width in inches")
    height_in: float | None = Field(None, description="Height in inches")
    depth_in: float | None = Field(None, description="Depth in inches")
    has_prints: bool = Field(False, description="Whether prints are available for purchase")
    orientation: str | None = Field(None, description="Orientation of the artwork")
    base_print_price: int | None = Field(None, description="Base price for print")
    tags: list[int] = Field([], description="List of tag IDs")
    collection_id: int | None = Field(None, description="ID of the collection")
    images: list[str | dict] | None = Field(
        None, description="Array of image URLs. The first image (index 0) is the main cover image."
    )


class ArtworkAdd(BaseModel):
    title: str = Field(..., description="Title of the artwork")
    description: str | None = Field(None, description="Description of the artwork")
    original_price: int | None = Field(None, description="Price of the original artwork")
    original_status: OriginalStatus = Field(
        OriginalStatus.AVAILABLE,
        description="Status of the original: available, sold, or not_for_sale",
    )
    year: int | None = Field(None)
    materials: str | None = Field(None)
    style: str | None = Field(None)
    width_cm: float | None = Field(None)
    height_cm: float | None = Field(None)
    depth_cm: float | None = Field(None)
    width_in: float | None = Field(None)
    height_in: float | None = Field(None)
    depth_in: float | None = Field(None)
    has_prints: bool = Field(False, description="Whether prints are available for purchase")
    orientation: str | None = Field(None, description="Orientation of the artwork")
    base_print_price: int | None = Field(None, description="Base price for print")
    collection_id: int | None = Field(None, description="ID of the collection")
    images: list[str | dict] | None = Field(
        None, description="Array of image URLs. The first image (index 0) is the main cover image."
    )


class Artwork(ArtworkAdd):
    id: int = Field(..., description="ID of the artwork")


class ArtworkWithTags(Artwork):
    tags: list[Tag]
    images: list[str | dict] | None = Field(
        None, description="Array of image URLs or image objects."
    )


class ArtworkPatchRequest(BaseModel):
    title: str | None = Field(None, description="Title of the artwork")
    description: str | None = Field(None, description="Description of the artwork")
    original_price: int | None = Field(None, description="Price of the original artwork")
    original_status: OriginalStatus | None = Field(
        None, description="Status of the original: available, sold, or not_for_sale"
    )
    year: int | None = Field(None)
    materials: str | None = Field(None)
    style: str | None = Field(None)
    width_cm: float | None = Field(None)
    height_cm: float | None = Field(None)
    depth_cm: float | None = Field(None)
    width_in: float | None = Field(None)
    height_in: float | None = Field(None)
    depth_in: float | None = Field(None)
    has_prints: bool | None = Field(None, description="Whether prints are available for purchase")
    orientation: str | None = Field(None, description="Orientation of the artwork")
    base_print_price: int | None = Field(None, description="Base price for print")
    tags: list[int] = Field([], description="List of tag IDs")
    collection_id: int | None = Field(None, description="ID of the collection")
    images: list[str | dict] | None = Field(
        None, description="Array of image URLs. The first image (index 0) is the main cover image."
    )


class ArtworkPatch(BaseModel):
    title: str | None = Field(None, description="Title of the artwork")
    description: str | None = Field(None, description="Description of the artwork")
    original_price: int | None = Field(None, description="Price of the original artwork")
    original_status: OriginalStatus | None = Field(
        None, description="Status of the original: available, sold, or not_for_sale"
    )
    year: int | None = Field(None)
    materials: str | None = Field(None)
    style: str | None = Field(None)
    width_cm: float | None = Field(None)
    height_cm: float | None = Field(None)
    depth_cm: float | None = Field(None)
    width_in: float | None = Field(None)
    height_in: float | None = Field(None)
    depth_in: float | None = Field(None)
    has_prints: bool | None = Field(None, description="Whether prints are available for purchase")
    orientation: str | None = Field(None, description="Orientation of the artwork")
    base_print_price: int | None = Field(None, description="Base price for print")
    collection_id: int | None = Field(None, description="ID of the collection")
    images: list[str | dict] | None = Field(
        None, description="Array of image URLs. The first image (index 0) is the main cover image."
    )


class ArtworkAddBulk(BaseModel):
    """Schema for bulk artwork creation"""

    title: str = Field(..., description="Title of the artwork")
    description: str | None = Field(None, description="Description of the artwork")
    original_price: int | None = Field(None, description="Price of the original artwork")
    original_status: OriginalStatus = Field(
        OriginalStatus.AVAILABLE,
        description="Status of the original: available, sold, or not_for_sale",
    )
    has_prints: bool = Field(False, description="Whether prints are available for purchase")
    orientation: str | None = Field(None, description="Orientation of the artwork")
    base_print_price: int | None = Field(None, description="Base price for print")
    images: list[str | dict] | None = Field(
        None, description="Array of image URLs. The first image (index 0) is the main cover image."
    )
