"""
API endpoints for managing the print pricing catalog and aspect ratio categories.

Provides:
  - Publicly readable aspect ratio list and full pricing grid.
  - Admin-only CRUD for aspect ratios (groups) and individual pricing rows.
"""

from fastapi import APIRouter, HTTPException

from src.api.dependencies import AdminDep, DBDep
from src.exeptions import DatabaseException, ObjectNotFoundException
from src.schemas.print_pricing import (
    AspectRatioCreate,
    AspectRatioItem,
    AspectRatioUpdate,
    AspectRatioWithPricing,
    PrintPricingCreate,
    PrintPricingItem,
    PrintPricingUpdate,
)
from src.services.print_pricing import PrintPricingService

router = APIRouter(prefix="/print-pricing", tags=["Print Pricing"])


# ── Aspect Ratio Endpoints ────────────────────────────────────────────────────

@router.get("/aspect-ratios", response_model=list[AspectRatioItem])
async def get_aspect_ratios(db: DBDep):
    """
    Returns all aspect ratio categories (without nested pricing rows).
    Publicly accessible — used by artwork creation forms.
    """
    return await PrintPricingService(db).get_all_aspect_ratios()


@router.get("/aspect-ratios/with-pricing", response_model=list[AspectRatioWithPricing])
async def get_aspect_ratios_with_pricing(db: DBDep):
    """
    Returns all aspect ratios with their full nested pricing grids.
    Used by the admin Print Pricing tab to render the grouped structure.
    """
    return await PrintPricingService(db).get_all_with_pricing()


@router.post("/aspect-ratios", response_model=AspectRatioItem, status_code=201)
async def create_aspect_ratio(data: AspectRatioCreate, admin_id: AdminDep, db: DBDep):
    """Creates a new aspect ratio category. Requires admin privileges."""
    try:
        return await PrintPricingService(db).create_aspect_ratio(data)
    except DatabaseException:
        raise HTTPException(status_code=500, detail="Failed to create aspect ratio")


@router.put("/aspect-ratios/{ratio_id}", response_model=AspectRatioItem)
async def update_aspect_ratio(ratio_id: int, data: AspectRatioUpdate, admin_id: AdminDep, db: DBDep):
    """Updates an existing aspect ratio category. Requires admin privileges."""
    try:
        return await PrintPricingService(db).update_aspect_ratio(ratio_id, data)
    except ObjectNotFoundException:
        raise HTTPException(status_code=404, detail="Aspect ratio not found")
    except DatabaseException:
        raise HTTPException(status_code=500, detail="Failed to update aspect ratio")


@router.delete("/aspect-ratios/{ratio_id}", status_code=204)
async def delete_aspect_ratio(ratio_id: int, admin_id: AdminDep, db: DBDep):
    """
    Deletes an aspect ratio and all its pricing rows.
    All artworks referencing this ratio will have their print_aspect_ratio_id set to NULL.
    Requires admin privileges.
    """
    try:
        await PrintPricingService(db).delete_aspect_ratio(ratio_id)
    except ObjectNotFoundException:
        raise HTTPException(status_code=404, detail="Aspect ratio not found")
    except DatabaseException:
        raise HTTPException(status_code=500, detail="Failed to delete aspect ratio")


# ── Pricing Row Endpoints ─────────────────────────────────────────────────────

@router.get("", response_model=list[PrintPricingItem])
async def get_print_pricing(db: DBDep):
    """
    Returns the full pricing grid (flat list).
    Publicly accessible — used by the shop frontend.
    """
    return await PrintPricingService(db).get_all()


@router.post("", response_model=PrintPricingItem, status_code=201)
async def create_print_pricing(data: PrintPricingCreate, admin_id: AdminDep, db: DBDep):
    """
    Adds a new size/price entry to the pricing grid under a specific aspect ratio.
    Requires admin privileges.
    """
    try:
        return await PrintPricingService(db).create(data)
    except ObjectNotFoundException:
        raise HTTPException(status_code=404, detail="Aspect ratio not found")
    except DatabaseException:
        raise HTTPException(status_code=500, detail="Failed to create pricing entry")


@router.put("/{item_id}", response_model=PrintPricingItem)
async def update_print_pricing(item_id: int, data: PrintPricingUpdate, admin_id: AdminDep, db: DBDep):
    """Updates an existing pricing entry. Requires admin privileges."""
    try:
        return await PrintPricingService(db).update(item_id, data)
    except ObjectNotFoundException:
        raise HTTPException(status_code=404, detail="Pricing entry not found")
    except DatabaseException:
        raise HTTPException(status_code=500, detail="Failed to update pricing entry")


@router.delete("/{item_id}", status_code=204)
async def delete_print_pricing(item_id: int, admin_id: AdminDep, db: DBDep):
    """Deletes a pricing entry. Requires admin privileges."""
    try:
        await PrintPricingService(db).delete(item_id)
    except ObjectNotFoundException:
        raise HTTPException(status_code=404, detail="Pricing entry not found")
    except DatabaseException:
        raise HTTPException(status_code=500, detail="Failed to delete pricing entry")
