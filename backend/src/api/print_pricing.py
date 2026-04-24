"""
API endpoints for normalized print aspect ratios and legacy manual pricing rows.

The active storefront no longer reads runtime prices from this module. Live
pricing comes from baked provider catalogs. The aspect ratio endpoints remain
active because artwork creation and print workflow still depend on them.
"""

from fastapi import APIRouter, HTTPException

from src.api.dependencies import AdminDep, DBDep
from src.exeptions import DatabaseException, ObjectNotFoundException
from src.schemas.print_pricing import (
    AspectRatioCreate,
    AspectRatioItem,
    AspectRatioUpdate,
    PrintPricingCreate,
    PrintPricingItem,
    PrintPricingUpdate,
)
from src.services.print_pricing import PrintPricingService

router = APIRouter(prefix="/print-pricing", tags=["Print Catalog"])


@router.get("/aspect-ratios", response_model=list[AspectRatioItem])
async def get_aspect_ratios(db: DBDep):
    """
    Returns all normalized print aspect ratio families.
    Publicly accessible because artwork forms and workflow editors use it.
    """
    return await PrintPricingService(db).get_all_aspect_ratios()


@router.post("/aspect-ratios", response_model=AspectRatioItem, status_code=201)
async def create_aspect_ratio(data: AspectRatioCreate, admin_id: AdminDep, db: DBDep):
    """Creates a new aspect ratio category. Requires admin privileges."""
    try:
        return await PrintPricingService(db).create_aspect_ratio(data)
    except DatabaseException:
        raise HTTPException(status_code=500, detail="Failed to create aspect ratio") from None


@router.put("/aspect-ratios/{ratio_id}", response_model=AspectRatioItem)
async def update_aspect_ratio(ratio_id: int, data: AspectRatioUpdate, admin_id: AdminDep, db: DBDep):
    """Updates an existing aspect ratio category. Requires admin privileges."""
    try:
        return await PrintPricingService(db).update_aspect_ratio(ratio_id, data)
    except ObjectNotFoundException:
        raise HTTPException(status_code=404, detail="Aspect ratio not found") from None
    except DatabaseException:
        raise HTTPException(status_code=500, detail="Failed to update aspect ratio") from None


@router.delete("/aspect-ratios/{ratio_id}", status_code=204)
async def delete_aspect_ratio(ratio_id: int, admin_id: AdminDep, db: DBDep):
    """
    Deletes an aspect ratio and all legacy pricing rows under it.
    Artworks referencing this ratio will have print_aspect_ratio_id set to NULL.
    """
    try:
        await PrintPricingService(db).delete_aspect_ratio(ratio_id)
    except ObjectNotFoundException:
        raise HTTPException(status_code=404, detail="Aspect ratio not found") from None
    except DatabaseException:
        raise HTTPException(status_code=500, detail="Failed to delete aspect ratio") from None


@router.get("", response_model=list[PrintPricingItem])
async def get_print_pricing(db: DBDep):
    """
    Returns the flat legacy manual pricing grid.
    Kept for compatibility; the storefront no longer uses this endpoint for live pricing.
    """
    return await PrintPricingService(db).get_all()


@router.post("", response_model=PrintPricingItem, status_code=201)
async def create_print_pricing(data: PrintPricingCreate, admin_id: AdminDep, db: DBDep):
    """Adds a legacy pricing entry under a specific aspect ratio. Requires admin privileges."""
    try:
        return await PrintPricingService(db).create(data)
    except ObjectNotFoundException:
        raise HTTPException(status_code=404, detail="Aspect ratio not found") from None
    except DatabaseException:
        raise HTTPException(status_code=500, detail="Failed to create pricing entry") from None


@router.put("/{item_id}", response_model=PrintPricingItem)
async def update_print_pricing(item_id: int, data: PrintPricingUpdate, admin_id: AdminDep, db: DBDep):
    """Updates an existing legacy pricing entry. Requires admin privileges."""
    try:
        return await PrintPricingService(db).update(item_id, data)
    except ObjectNotFoundException:
        raise HTTPException(status_code=404, detail="Pricing entry not found") from None
    except DatabaseException:
        raise HTTPException(status_code=500, detail="Failed to update pricing entry") from None


@router.delete("/{item_id}", status_code=204)
async def delete_print_pricing(item_id: int, admin_id: AdminDep, db: DBDep):
    """Deletes a legacy pricing entry. Requires admin privileges."""
    try:
        await PrintPricingService(db).delete(item_id)
    except ObjectNotFoundException:
        raise HTTPException(status_code=404, detail="Pricing entry not found") from None
    except DatabaseException:
        raise HTTPException(status_code=500, detail="Failed to delete pricing entry") from None
