"""
API endpoints for managing the print pricing catalog.
Provides a publicly readable price list and admin-only CRUD operations.
"""

from fastapi import APIRouter, HTTPException

from src.api.dependencies import AdminDep, DBDep
from src.exeptions import DatabaseException, ObjectNotFoundException
from src.schemas.print_pricing import PrintPricingCreate, PrintPricingItem, PrintPricingUpdate
from src.services.print_pricing import PrintPricingService

router = APIRouter(prefix="/print-pricing", tags=["Print Pricing"])


@router.get("", response_model=list[PrintPricingItem])
async def get_print_pricing(db: DBDep):
    """
    Returns the full print pricing grid.
    Publicly accessible — used by the shop frontend to show print prices.
    """
    return await PrintPricingService(db).get_all()


@router.post("", response_model=PrintPricingItem, status_code=201)
async def create_print_pricing(
    data: PrintPricingCreate,
    admin_id: AdminDep,
    db: DBDep,
):
    """
    Adds a new size/price entry to the print pricing grid.
    Requires admin privileges.
    """
    try:
        return await PrintPricingService(db).create(data)
    except DatabaseException:
        raise HTTPException(status_code=500, detail="Failed to create pricing entry")


@router.put("/{item_id}", response_model=PrintPricingItem)
async def update_print_pricing(
    item_id: int,
    data: PrintPricingUpdate,
    admin_id: AdminDep,
    db: DBDep,
):
    """
    Updates an existing pricing entry (size label or price).
    Requires admin privileges.
    """
    try:
        return await PrintPricingService(db).update(item_id, data)
    except ObjectNotFoundException:
        raise HTTPException(status_code=404, detail="Pricing entry not found")
    except DatabaseException:
        raise HTTPException(status_code=500, detail="Failed to update pricing entry")


@router.delete("/{item_id}", status_code=204)
async def delete_print_pricing(
    item_id: int,
    admin_id: AdminDep,
    db: DBDep,
):
    """
    Deletes a pricing entry from the grid.
    Requires admin privileges.
    """
    try:
        await PrintPricingService(db).delete(item_id)
    except ObjectNotFoundException:
        raise HTTPException(status_code=404, detail="Pricing entry not found")
    except DatabaseException:
        raise HTTPException(status_code=500, detail="Failed to delete pricing entry")
