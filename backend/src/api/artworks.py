"""
API endpoints for managing artworks.
Includes CRUD operations, bulk creation, and image uploading.
"""

import json
import os
import shutil

from fastapi import APIRouter, Body, File, HTTPException, Query, UploadFile

from src.api.dependencies import AdminDep, DBDep
from src.exeptions import ObjectNotFoundException
from src.init import redis_manager
from src.print_on_demand import get_print_provider
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
    labels: list[int] | None = Query(None),
    year_from: int | None = Query(None),
    year_to: int | None = Query(None),
    price_min: int | None = Query(None),
    price_max: int | None = Query(None),
    orientation: str | None = Query(None),  # horizontal | vertical | square
    size_category: str | None = Query(None),  # small | medium | large
    country: str | None = Query(
        None,
        min_length=2,
        max_length=2,
        description="ISO 3166-1 alpha-2. When provided, artworks are enriched with baked storefront summary for this region.",
    ),
):
    """
    Retrieves a list of artworks with optional filtering and pagination.
    """
    return await ArtworkService(db).get_all_artworks(
        limit=limit,
        offset=offset,
        title=title,
        labels=labels,
        year_from=year_from,
        year_to=year_to,
        price_min=price_min,
        price_max=price_max,
        orientation=orientation,
        size_category=size_category,
        country_code=country.upper() if country else None,
    )


@router.get("/{artwork_id_or_slug}")
async def get_artwork(
    artwork_id_or_slug: str,
    db: DBDep,
    country: str | None = Query(
        None,
        min_length=2,
        max_length=2,
        description="Optional ISO 3166-1 alpha-2 country code for baked storefront enrichment.",
    ),
):
    """
    Retrieves a single artwork by its numeric ID or unique slug.
    """
    try:
        if artwork_id_or_slug.isdigit():
            artwork = await ArtworkService(db).get_artwork_by_id(int(artwork_id_or_slug))
        else:
            artwork = await ArtworkService(db).get_artwork_by_slug(artwork_id_or_slug)

        if not country:
            return artwork

        serialized = artwork.model_dump(mode="json")
        country_code = country.upper()
        provider = get_print_provider()
        serialized["print_storefront"] = await provider.get_artwork_storefront(
            db=db,
            artwork_id_or_slug=artwork_id_or_slug,
            country_code=country_code,
        )
        serialized["storefront_summary"] = provider.build_summary_from_storefront_payload(
            serialized["print_storefront"]
        )
        return serialized
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
                    "labels": [1, 2],
                },
            }
        },
    ),
):
    """
    Creates a new artwork in the database. Requires admin privileges.
    """
    artwork = await ArtworkService(db).create_artwork(artwork_data)
    return {"status": "OK", "data": artwork}


@router.put("/{artwork_id}")
async def update_artwork(
    artwork_id: int,
    admin_id: AdminDep,
    db: DBDep,
    artwork_data: ArtworkAddRequest = Body(),
):
    """
    Updates an entire artwork record by its ID. Requires admin privileges.
    """
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
                "summary": "Update labels",
                "value": {"labels": [1, 3, 5]},
            },
        },
    ),
):
    """
    Partially updates an artwork record by its ID. Requires admin privileges.
    """
    await ArtworkService(db).update_artwork_partially(artwork_id, artwork_data)
    return {"status": "OK"}


@router.post("/{artwork_id}/images")
async def upload_artwork_images(
    artwork_id: int, admin_id: AdminDep, files: list[UploadFile] = File(...)
):
    """
    Uploads multiple images for a specific artwork.
    Images are saved to a temporary directory and then processed asynchronously via Celery.
    """
    # ВАЖНО: temp-папка должна быть внутри shared volume (static/images/temp),
    # чтобы Celery worker (отдельный контейнер) смог получить доступ к файлам.
    # static/images монтируется через media_data volume в api и worker.
    os.makedirs("static/images/temp", exist_ok=True)
    temp_paths = []
    for idx, file in enumerate(files):
        # Use idx to prevent collisions when the same filename is uploaded twice
        temp_path = f"static/images/temp/art_{artwork_id}_{idx}_{file.filename}"
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        temp_paths.append(temp_path)

    process_and_attach_image.delay(model_type="artwork", model_id=artwork_id, temp_paths=temp_paths)
    return {"status": "processing"}


@router.post("/{artwork_id}/print-image")
async def upload_print_quality_image(
    artwork_id: int, admin_id: AdminDep, db: DBDep, file: UploadFile = File(...)
):
    """
    Uploads a high-resolution source image for print-on-demand fulfillment.
    The file is stored as-is (no conversion, no resize) to preserve maximum quality.
    Supported formats: TIFF, PNG, JPEG, WebP.
    Prodigi requires: ≥ 150 DPI at print size, recommended 300 DPI.
    """
    ALLOWED_TYPES = {"image/tiff", "image/png", "image/jpeg", "image/webp", "image/x-tiff"}
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(400, "Unsupported format. Use TIFF, PNG, JPEG or WebP.")

    out_dir = "static/print"
    os.makedirs(out_dir, exist_ok=True)

    # Keep the original extension so the active provider receives the raw asset format.
    original_ext = os.path.splitext(file.filename or "upload")[1] or ".jpg"
    safe_ext = original_ext.lower().replace(".tiff", ".tif")
    from uuid import uuid4
    filename = f"print_{artwork_id}_{uuid4().hex[:8]}{safe_ext}"
    dest_path = f"{out_dir}/{filename}"

    with open(dest_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    public_url = f"/static/print/{filename}"
    source_metadata = get_print_provider().extract_source_metadata(
        file_path=dest_path,
        public_url=public_url,
    )

    # Persist the URL directly on the artwork record
    await ArtworkService(db).update_artwork_partially(
        artwork_id,
        ArtworkPatchRequest(
            print_quality_url=public_url,
            print_source_metadata=source_metadata,
        ),
    )

    return {"url": public_url, "metadata": source_metadata}


@router.get("/{artwork_id}/print-profile")
async def get_artwork_print_profile(artwork_id: int, db: DBDep):
    """
    Returns the recommended and effective active-provider print-profile bundle for one artwork.

    This endpoint is intended to power the future admin editor and the storefront's
    production-aware print rendering layer.
    """
    try:
        return await get_print_provider().get_print_profile_bundle(
            db=db,
            artwork_id=artwork_id,
        )
    except ObjectNotFoundException:
        raise HTTPException(status_code=404, detail="Artwork not found")


async def _get_artwork_print_storefront(
    artwork_id_or_slug: str,
    db: DBDep,
    country: str = Query(..., min_length=2, max_length=2, description="ISO 3166-1 alpha-2"),
):
    """
    Resolves public storefront print offers for one artwork in one destination country.

    The response is built from the active provider's baked snapshot plus artwork-specific
    print profile metadata, so the storefront can stop depending on raw supplier probing.
    """
    cache_key = f"api:artwork-prints:v1:{artwork_id_or_slug}:{(country or '').upper()}"
    if redis_manager.redis is not None:
        cached = await redis_manager.get(cache_key)
        if cached:
            try:
                return json.loads(cached)
            except json.JSONDecodeError:
                pass

    try:
        payload = await get_print_provider().get_artwork_storefront(
            db=db,
            artwork_id_or_slug=artwork_id_or_slug,
            country_code=country,
        )
        if redis_manager.redis is not None:
            await redis_manager.set(cache_key, json.dumps(payload), expire=900)
        return payload
    except ObjectNotFoundException:
        raise HTTPException(status_code=404, detail="Artwork not found")


@router.get("/{artwork_id_or_slug}/prints")
async def get_artwork_print_storefront(
    artwork_id_or_slug: str,
    db: DBDep,
    country: str = Query(..., min_length=2, max_length=2, description="ISO 3166-1 alpha-2"),
):
    """
    Public storefront print offers for one artwork and one destination country.

    This is the clean, stable client-facing route for the website and any future
    validation UI around print configuration.
    """
    return await _get_artwork_print_storefront(
        artwork_id_or_slug=artwork_id_or_slug,
        db=db,
        country=country,
    )


@router.get("/{artwork_id_or_slug}/storefront-offers")
async def get_artwork_storefront_offers(
    artwork_id_or_slug: str,
    db: DBDep,
    country: str = Query(..., min_length=2, max_length=2, description="ISO 3166-1 alpha-2"),
):
    """
    Backward-compatible alias for the older storefront naming.
    """
    return await _get_artwork_print_storefront(
        artwork_id_or_slug=artwork_id_or_slug,
        db=db,
        country=country,
    )


@router.delete("/{artwork_id}")
async def delete_artwork(artwork_id: int, admin_id: AdminDep, db: DBDep):
    """
    Deletes an artwork record from the database by its ID. Requires admin privileges.
    """
    await ArtworkService(db).delete_artwork(artwork_id)
    return {"status": "OK"}


@bulk_router.post("")
async def create_artworks_bulk(
    admin_id: AdminDep, db: DBDep, artworks_data: list[ArtworkAddBulk] = Body()
):
    """
    Creates multiple artworks in a single request. Requires admin privileges.
    """
    count = await ArtworkService(db).create_artworks_bulk(artworks_data)
    return {"status": "OK", "count": count}
