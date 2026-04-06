"""
API endpoints for managing artwork collections.
"""
from fastapi import APIRouter, Body, HTTPException

from src.api.dependencies import AdminDep, DBDep
from src.exeptions import ObjectAlreadyExistsException, ObjectNotFoundException
from src.schemas.collections import CollectionAdd, CollectionPatch
from src.services.collections import CollectionService

router = APIRouter(prefix="/collections", tags=["Collections"])


@router.get("")
async def get_collections(db: DBDep):
    """
    Retrieves all available artwork collections.
    """
    return await CollectionService(db).get_all_collections()


@router.post("")
async def create_collection(
    admin_id: AdminDep, db: DBDep, collection_data: CollectionAdd = Body(...)
):
    """
    Creates a new collection. Requires admin privileges.
    """
    try:
        return await CollectionService(db).create_collection(collection_data)
    except ObjectAlreadyExistsException:
        raise HTTPException(status_code=409, detail="Collection already exists")


@router.delete("/{collection_id}")
async def delete_collection(admin_id: AdminDep, db: DBDep, collection_id: int):
    """
    Deletes a collection by its ID. Requires admin privileges.
    """
    try:
        await CollectionService(db).delete_collection(collection_id)
        return {"status": "OK"}
    except ObjectNotFoundException:
        raise HTTPException(status_code=404, detail="Collection not found")


@router.patch("/{collection_id}")
async def update_collection(
    admin_id: AdminDep, db: DBDep, collection_id: int, collection_data: CollectionPatch = Body(...)
):
    """
    Updates an existing collection partially. Requires admin privileges.
    """
    try:
        await CollectionService(db).update_collection(collection_id, collection_data)
        return {"status": "OK"}
    except ObjectNotFoundException:
        raise HTTPException(status_code=404, detail="Collection not found")
