from fastapi import APIRouter, Body, HTTPException
from fastapi_cache.decorator import cache

from src.api.dependencies import DBDep
from src.services.tags import TagService
from src.schemas.tags import TagAdd


router = APIRouter(prefix="/tags", tags=["Tags"])


@router.get("")
@cache(expire=10)
async def get_tags(db: DBDep):
    return await TagService(db).get_all_tags()


@router.post("")
async def create_tag(db: DBDep, tag_data: TagAdd = Body()):
    tag = await TagService(db).create_tag(tag_data)
    return {"status": "OK", "data": tag}
