"""
API endpoints for managing artwork tags and categories.
Provides functionality for tag retrieval, usage tracking, and CRUD operations.
"""
from fastapi import APIRouter, Body, Query
from fastapi_cache.decorator import cache

from src.api.dependencies import AdminDep, DBDep
from src.schemas.tags import TagAdd
from src.services.tags import TagService

router = APIRouter(prefix="/tags", tags=["Tags"])


@router.get("")
@cache(expire=10)
async def get_tags(db: DBDep, category: str | None = Query(None)):
    """
    Retrieves all tags, optionally filtered by category.
    Results are cached for 10 seconds.
    """
    return await TagService(db).get_all_tags(category=category)


@router.get("/{tag_id}/usage")
async def get_tag_usage(tag_id: int, db: DBDep):
    """
    Returns the number of artworks that reference a specific tag.
    Used by the frontend to warn users before tag deletion.
    """
    count = await TagService(db).get_tag_usage_count(tag_id)
    return {"tag_id": tag_id, "artwork_count": count}


@router.post("")
async def create_tag(admin_id: AdminDep, db: DBDep, tag_data: TagAdd = Body()):
    """
    Creates a new tag. Requires admin privileges.
    """
    tag = await TagService(db).create_tag(tag_data)
    return {"status": "OK", "data": tag}


@router.delete("/{tag_id}")
async def delete_tag(admin_id: AdminDep, db: DBDep, tag_id: int):
    """
    Deletes a tag by its ID. Requires admin privileges.
    """
    await TagService(db).delete_tag(tag_id)
    return {"status": "OK"}
