from fastapi import APIRouter, Body, Query
from fastapi_cache.decorator import cache

from src.api.dependencies import AdminDep, DBDep
from src.schemas.labels import LabelAdd, LabelCategoryAdd
from src.services.labels import LabelService

router = APIRouter(prefix="/labels", tags=["Labels"])


@router.get("/categories")
@cache(expire=10)
async def get_label_categories(db: DBDep):
    return await LabelService(db).get_all_categories()


@router.post("/categories")
async def create_label_category(admin_id: AdminDep, db: DBDep, cat_data: LabelCategoryAdd = Body()):
    cat = await LabelService(db).create_category(cat_data)
    return {"status": "OK", "data": cat}


@router.delete("/categories/{cat_id}")
async def delete_label_category(admin_id: AdminDep, db: DBDep, cat_id: int):
    await LabelService(db).delete_category(cat_id)
    return {"status": "OK"}


@router.get("")
@cache(expire=10)
async def get_labels(db: DBDep, category_id: int | None = Query(None)):
    return await LabelService(db).get_all_labels(category_id=category_id)


@router.get("/{label_id}/usage")
async def get_label_usage(label_id: int, db: DBDep):
    count = await LabelService(db).get_label_usage_count(label_id)
    return {"label_id": label_id, "artwork_count": count}


@router.post("")
async def create_label(admin_id: AdminDep, db: DBDep, label_data: LabelAdd = Body()):
    label = await LabelService(db).create_label(label_data)
    return {"status": "OK", "data": label}


@router.delete("/{label_id}")
async def delete_label(admin_id: AdminDep, db: DBDep, label_id: int):
    await LabelService(db).delete_label(label_id)
    return {"status": "OK"}
