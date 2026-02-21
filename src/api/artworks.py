from fastapi import APIRouter, Body, HTTPException, Query

from src.api.dependencies import DBDep
from src.exeptions import ObjectNotFoundException
from src.services.artworks import ArtworkService
from src.schemas.artworks import ArtworkAddRequest, ArtworkPatchRequest, ArtworkAddBulk


router = APIRouter(prefix="/collections/{collection_id}/artworks", tags=["Artworks"])
bulk_router = APIRouter(prefix="/artworks/bulk", tags=["Artworks"])


@router.get("")
async def get_artworks(
    collection_id: int,
    db: DBDep,
):
    return await ArtworkService(db).get_all_artworks(
        collection_id=collection_id
    )


@router.get("/{artwork_id}")
async def get_artwork(collection_id: int, artwork_id: int, db: DBDep):
    try:
        return await ArtworkService(db).get_artwork_by_id(collection_id, artwork_id)
    except ObjectNotFoundException:
        raise HTTPException(status_code=404, detail="Artwork not found")


@router.post("")
async def create_artwork(
    collection_id: int,
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
    artwork = await ArtworkService(db).create_artwork(collection_id, artwork_data)
    return {"status": "OK", "data": artwork}


@router.put("/{artwork_id}")
async def update_artwork(
    collection_id: int,
    artwork_id: int,
    db: DBDep,
    artwork_data: ArtworkAddRequest = Body(),
):
    await ArtworkService(db).update_artwork(collection_id, artwork_id, artwork_data)
    return {"status": "OK"}


@router.patch("/{artwork_id}")
async def patch_artwork(
    artwork_id: int,
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
    collection_id: int = 0,
):
    await ArtworkService(db).update_artwork_partially(artwork_id, artwork_data)
    return {"status": "OK"}


@router.delete("/{artwork_id}")
async def delete_artwork(artwork_id: int, db: DBDep, collection_id: int = 0):
    await ArtworkService(db).delete_artwork(artwork_id)
    return {"status": "OK"}


@bulk_router.post("")
async def create_artworks_bulk(db: DBDep, artworks_data: list[ArtworkAddBulk] = Body()):
    count = await ArtworkService(db).create_artworks_bulk(artworks_data)
    return {"status": "OK", "count": count}
