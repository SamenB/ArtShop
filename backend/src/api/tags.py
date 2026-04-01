from fastapi import APIRouter, Body, Query
from fastapi_cache.decorator import cache

from src.api.dependencies import AdminDep, DBDep
from src.schemas.tags import TagAdd
from src.services.tags import TagService

router = APIRouter(prefix="/tags", tags=["Tags"])


@router.get("")
@cache(expire=10)
async def get_tags(db: DBDep, category: str | None = Query(None)):
    return await TagService(db).get_all_tags(category=category)


@router.get("/{tag_id}/usage")
async def get_tag_usage(tag_id: int, db: DBDep):
    """Returns how many artworks reference this tag — used by frontend before deletion."""
    count = await TagService(db).get_tag_usage_count(tag_id)
    return {"tag_id": tag_id, "artwork_count": count}


@router.post("")
async def create_tag(admin_id: AdminDep, db: DBDep, tag_data: TagAdd = Body()):
    tag = await TagService(db).create_tag(tag_data)
    return {"status": "OK", "data": tag}


@router.delete("/{tag_id}")
async def delete_tag(admin_id: AdminDep, db: DBDep, tag_id: int):
    await TagService(db).delete_tag(tag_id)
    return {"status": "OK"}
