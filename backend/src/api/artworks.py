import os
import shutil

from fastapi import APIRouter, Body, File, HTTPException, Query, UploadFile

from src.api.dependencies import AdminDep, DBDep
from src.exeptions import ObjectNotFoundException
from src.schemas.artworks import ArtworkAddBulk, ArtworkAddRequest, ArtworkPatchRequest
from src.services.artworks import ArtworkService
from src.tasks.tasks import process_and_attach_image

router = APIRouter(prefix="/artworks", tags=["Artworks"])
bulk_router = APIRouter(prefix="/artworks/bulk", tags=["Artworks"])


@router.get("")
async def get_artworks(
    db: DBDep,
    limit: int = Query(10, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    title: str | None = Query(None),
    tags: list[int] | None = Query(None),
):
    return await ArtworkService(db).get_all_artworks(
        limit=limit, offset=offset, title=title, tags=tags
    )


@router.get("/{artwork_id}")
async def get_artwork(artwork_id: int, db: DBDep):
    try:
        return await ArtworkService(db).get_artwork_by_id(artwork_id)
    except ObjectNotFoundException:
        raise HTTPException(status_code=404, detail="Artwork not found")


@router.post("")
async def create_artwork(
    admin_id: AdminDep,
    db: DBDep,
    artwork_data: ArtworkAddRequest = Body(
        openapi_examples={
            "1": {
                "summary": "Basic artwork",
                "value": {
                    "title": "Starry Night",
                    "description": "A famous painting by Van Gogh",
                    "price": 10000,
                    "quantity": 1,
                    "tags": [1, 2],
                },
            }
        },
    ),
):
    artwork = await ArtworkService(db).create_artwork(artwork_data)
    return {"status": "OK", "data": artwork}


@router.put("/{artwork_id}")
async def update_artwork(
    artwork_id: int,
    admin_id: AdminDep,
    db: DBDep,
    artwork_data: ArtworkAddRequest = Body(),
):
    await ArtworkService(db).update_artwork(artwork_id, artwork_data)
    return {"status": "OK"}


@router.patch("/{artwork_id}")
async def patch_artwork(
    artwork_id: int,
    admin_id: AdminDep,
    db: DBDep,
    artwork_data: ArtworkPatchRequest = Body(
        openapi_examples={
            "1": {
                "summary": "Update title",
                "value": {"title": "Updated Title"},
            },
            "2": {
                "summary": "Update tags",
                "value": {"tags": [1, 3, 5]},
            },
        },
    ),
):
    await ArtworkService(db).update_artwork_partially(artwork_id, artwork_data)
    return {"status": "OK"}


@router.post("/{artwork_id}/images")
async def upload_artwork_images(
    artwork_id: int, admin_id: AdminDep, files: list[UploadFile] = File(...)
):
    os.makedirs("temp", exist_ok=True)
    temp_paths = []
    for file in files:
        temp_path = f"temp/art_{artwork_id}_{file.filename}"
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        temp_paths.append(temp_path)

    process_and_attach_image.delay(model_type="artwork", model_id=artwork_id, temp_paths=temp_paths)
    return {"status": "processing"}


@router.delete("/{artwork_id}")
async def delete_artwork(artwork_id: int, admin_id: AdminDep, db: DBDep):
    await ArtworkService(db).delete_artwork(artwork_id)
    return {"status": "OK"}


@bulk_router.post("")
async def create_artworks_bulk(
    admin_id: AdminDep, db: DBDep, artworks_data: list[ArtworkAddBulk] = Body()
):
    count = await ArtworkService(db).create_artworks_bulk(artworks_data)
    return {"status": "OK", "count": count}
