"""API endpoints for managing print pricing regions and their multipliers."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from src.api.dependencies import AdminDep, DBDep
from src.services.print_pricing_regions import ALL_CATEGORY_IDS, PrintPricingRegionService

router = APIRouter(prefix="/print-pricing", tags=["Print Pricing"])


class RegionMultiplierUpdate(BaseModel):
    """Payload for updating one region's multipliers."""

    default_multiplier: float | None = Field(default=None, ge=1.0, le=10.0)
    category_multipliers: dict[str, float] | None = None


class CountryRegionAssignmentUpdate(BaseModel):
    """Payload for moving a country into one pricing region."""

    country_code: str = Field(..., min_length=2, max_length=2)
    target_region_slug: str = Field(..., pattern="^(premium|mid|budget)$")


@router.get("/regions")
async def get_pricing_regions(db: DBDep):
    """Return all pricing regions with their category multiplier grids."""
    regions = await PrintPricingRegionService(db).get_all_regions()
    return {
        "regions": regions,
        "category_ids": ALL_CATEGORY_IDS,
    }


@router.put("/regions/{region_id}/multipliers")
async def update_region_multipliers(
    region_id: int,
    body: RegionMultiplierUpdate,
    admin_id: AdminDep,
    db: DBDep,
):
    """Update the default multiplier and/or per-category overrides for a region."""
    if body.category_multipliers is not None:
        invalid = [
            category_id
            for category_id, value in body.category_multipliers.items()
            if value < 1.0 or value > 10.0
        ]
        if invalid:
            raise HTTPException(
                status_code=422,
                detail=f"Multipliers must be between 1.0 and 10.0: {', '.join(invalid)}",
            )
    service = PrintPricingRegionService(db)
    result = await service.update_region_multipliers(
        region_id,
        default_multiplier=body.default_multiplier,
        category_multipliers=body.category_multipliers,
    )
    if result is None:
        raise HTTPException(status_code=404, detail="Region not found")
    return result


@router.put("/regions/country-assignment")
async def update_country_region_assignment(
    body: CountryRegionAssignmentUpdate,
    admin_id: AdminDep,
    db: DBDep,
):
    """Move a country between Premium, Mid, and Budget/Fallback."""
    result = await PrintPricingRegionService(db).move_country_to_region(
        country_code=body.country_code,
        target_region_slug=body.target_region_slug,
    )
    if result is None:
        raise HTTPException(status_code=404, detail="Pricing region or country was not found")
    return {
        "regions": result,
        "category_ids": ALL_CATEGORY_IDS,
    }


@router.post("/regions/seed", status_code=201)
async def seed_default_regions(admin_id: AdminDep, db: DBDep):
    """Upsert the managed Premium/Mid/Budget pricing regions."""
    result = await PrintPricingRegionService(db).seed_defaults()
    return result
