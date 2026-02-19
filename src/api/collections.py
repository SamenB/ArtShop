from fastapi import APIRouter, Body, HTTPException, UploadFile, Query

from src.api.dependencies import PaginationDep, DBDep
from src.exeptions import ObjectNotFoundException, ObjectAlreadyExistsException, DatabaseException
from src.services.collections import CollectionService
from src.schemas.collections import CollectionAdd, CollectionPatch


router = APIRouter(prefix="/collections", tags=["Collections"])


@router.get("")
async def get_collections(
    pagination: PaginationDep,
    db: DBDep,
    title: str | None = Query(None, description="Title of the collection"),
    location: str | None = Query(None, description="Location of the collection"),
    available: bool = Query(True, description="Show available collections"),
):
    per_page = pagination.per_page
    offset = per_page * (pagination.page - 1)
    try:
        return await CollectionService(db).get_all_collections(
            available=available,
            title=title,
            location=location,
            per_page=per_page,
            offset=offset,
        )
    except DatabaseException:
        raise HTTPException(status_code=500, detail="Database error")


@router.get("/{collection_id}")
async def get_collection(collection_id: int, db: DBDep):
    try:
        return await CollectionService(db).get_collection_by_id(collection_id)
    except ObjectNotFoundException:
        raise HTTPException(status_code=404, detail="Collection not found")


@router.post("")
async def create_collection(db: DBDep, collection_data: CollectionAdd = Body()):
    try:
        await CollectionService(db).create_collection(collection_data)
    except ObjectAlreadyExistsException:
        raise HTTPException(status_code=409, detail="Collection already exists")
    except DatabaseException:
        raise HTTPException(status_code=500, detail="Database error")
    return {"status": "OK"}


@router.put("/{collection_id}")
async def update_collection(
    collection_id: int,
    db: DBDep,
    collection_data: CollectionAdd = Body(
        openapi_examples={
            "1": {
                "summary": "General update",
                "value": {
                    "title": "Updated Collection Title",
                    "location": "Updated Location",
                },
            }
        },
    ),
):
    try:
        await CollectionService(db).update_collection(collection_id, collection_data)
    except DatabaseException:
        raise HTTPException(status_code=500, detail="Database error")
    return {"status": "OK"}


@router.patch("/{collection_id}")
async def patch_collection(
    collection_id: int,
    db: DBDep,
    collection_data: CollectionPatch = Body(
        openapi_examples={
            "1": {
                "summary": "Update title",
                "value": {"title": "Updated Title"},
            },
            "2": {
                "summary": "Update location",
                "value": {"location": "Updated Location"},
            },
        },
    ),
):
    try:
        await CollectionService(db).update_collection_partially(collection_id, collection_data)
    except DatabaseException:
        raise HTTPException(status_code=500, detail="Database error")
    return {"status": "OK"}


@router.delete("/{collection_id}")
async def delete_collection(collection_id: int, db: DBDep):
    try:
        await CollectionService(db).delete_collection(collection_id)
    except DatabaseException:
        raise HTTPException(status_code=500, detail="Database error")
    return {"status": "OK"}


@router.post("/{collection_id}/image")
async def upload_collection_image(collection_id: int, file: UploadFile):
    CollectionService.upload_collection_image(collection_id, file)
    return {"status": "OK"}
