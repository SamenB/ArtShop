from fastapi import APIRouter, Body, HTTPException
from fastapi_cache.decorator import cache

from src.api.dependencies import DBDep
from src.exeptions import ObjectAlreadyExistsException, DatabaseException
from src.services.tags import TagService
from src.schemas.tags import TagAdd


router = APIRouter(prefix="/tags", tags=["Tags"])


@router.get("")
@cache(expire=10)
async def get_tags(db: DBDep):
    try:
        return await TagService(db).get_all_tags()
    except DatabaseException:
        raise HTTPException(status_code=500, detail="Database error")


@router.post("")
async def create_tag(db: DBDep, tag_data: TagAdd = Body()):
    try:
        tag = await TagService(db).create_tag(tag_data)
    except ObjectAlreadyExistsException:
        raise HTTPException(status_code=409, detail="Tag already exists")
    except DatabaseException:
        raise HTTPException(status_code=500, detail="Database error")
    return {"status": "OK", "data": tag}
