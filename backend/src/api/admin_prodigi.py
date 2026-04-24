from fastapi import APIRouter, HTTPException, Query

from src.api.dependencies import AdminDep, DBDep
from src.api.print_options import MARKUP
from src.connectors.prodigi import ProdigiClient
from src.init import redis_manager
from src.repositories.prodigi_storefront import ProdigiStorefrontRepository
from src.services.prodigi_catalog import ProdigiCatalogService
from src.services.prodigi_catalog_preview import ProdigiCatalogPreviewService
from src.services.prodigi_storefront_bake import ProdigiStorefrontBakeService
from src.services.prodigi_storefront_snapshot import ProdigiStorefrontSnapshotService

router = APIRouter(prefix="/v1/admin/prodigi", tags=["Admin Prodigi Diagnostics"])
catalog_service = ProdigiCatalogService()
ARTWORK_PRINT_CACHE_PREFIXES = (
    "api:artwork-prints:v1:",
    "prodigi:artwork-storefront:v1:",
)


def _resolve_refresh_bake_config(active_bake) -> dict[str, object]:
    return {
        "selected_paper_material": getattr(active_bake, "paper_material", None),
        "include_notice_level": bool(
            getattr(active_bake, "include_notice_level", True)
            if active_bake is not None
            else True
        ),
    }


async def _clear_artwork_print_storefront_cache() -> dict[str, object]:
    redis_client = redis_manager.redis
    if redis_client is None:
        return {
            "status": "skipped",
            "deleted_keys": 0,
            "reason": "Redis is not connected.",
        }

    keys: list[str] = []
    if hasattr(redis_client, "scan_iter"):
        seen: set[str] = set()
        for prefix in ARTWORK_PRINT_CACHE_PREFIXES:
            async for key in redis_client.scan_iter(match=f"{prefix}*"):
                key_str = str(key)
                if key_str not in seen:
                    seen.add(key_str)
                    keys.append(key_str)
    elif hasattr(redis_client, "data") and isinstance(redis_client.data, dict):
        keys = [
            str(key)
            for key in redis_client.data.keys()
            if any(str(key).startswith(prefix) for prefix in ARTWORK_PRINT_CACHE_PREFIXES)
        ]

    deleted = 0
    for key in keys:
        await redis_manager.delete(key)
        deleted += 1

    return {
        "status": "cleared",
        "deleted_keys": deleted,
    }

@router.get("/probe")
async def probe_prodigi(
    admin_id: AdminDep,
    country: str = Query(..., description="ISO 3166-1 alpha-2, e.g. DE"),
    aspect_ratio: str = Query(..., description="Normalised portrait ratio, e.g. 2:3"),
    family: str = Query("GLOBAL-HPR", description="Prodigi SKU prefix e.g. GLOBAL-HPR, GLOBAL-CAN")
):
    """
    Directly probe Prodigi API for a specific country, ratio and family.
    Bypasses standard caching for real-time diagnostic visibility.
    """
    try:
        results = await catalog_service.get_detailed_options(
            country.upper(),
            aspect_ratio,
            family.upper(),
        )

        # Inject retail prices for convenience
        for item in results:
            for tier in item.get("shipping_tiers", []):
                tier["retail_product_eur"] = round(tier["wholesale_cost_eur"] * MARKUP, 2)
                tier["total_retail_eur"] = round(tier["retail_product_eur"] + tier["shipping_cost_eur"], 2)

        return {
            "country": country.upper(),
            "aspect_ratio": aspect_ratio,
            "family": family.upper(),
            "count": len(results),
            "results": results,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/raw-sku")
async def get_raw_sku(
    admin_id: AdminDep,
    sku: str = Query(...)
):
    """
    Fetches the raw JSON response from Prodigi GET /products/{sku} for deep inspection.
    """
    async with ProdigiClient() as client:
        try:
            # We use the low-level get helper from the client to see everything
            raw_data = await client.get(f"/products/{sku}")
            if not raw_data:
                 raise HTTPException(status_code=404, detail="SKU not found in Prodigi")
            return raw_data
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

@router.get("/raw-quote")
async def get_raw_quote(
    admin_id: AdminDep,
    sku: str = Query(...),
    country: str = Query(...),
    attributes: str = Query("{}")
):
    """
    Fetches the raw JSON response from Prodigi POST /quotes for deep inspection.
    """
    import json
    try:
        attr_dict = json.loads(attributes)
    except json.JSONDecodeError:
        attr_dict = {}

    async with ProdigiClient() as client:
        try:
            raw_data = await client.get_quote(sku, country, "EUR", attr_dict)
            return raw_data
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))


@router.get("/catalog-preview")
async def get_catalog_preview(
    admin_id: AdminDep,
    db: DBDep,
    aspect_ratio: str | None = Query(None, description="Preview ratio, e.g. 4:5"),
    country: str | None = Query(None, description="Destination country ISO, e.g. DE"),
    paper_material: str | None = Query(None, description="Normalized paper material, e.g. hahnemuhle_german_etching"),
    include_notice_level: bool = Query(
        True,
        description="Whether notice-level cross-border categories remain visible in storefront preview.",
    ),
):
    """
    Curated preview of the future ArtShop print catalog.
    Reads from imported Prodigi SQL tables and shows what the baked storefront
    database would expose after our business filters are applied.
    """
    try:
        preview_service = ProdigiCatalogPreviewService(db)
        preview = await preview_service.get_preview(
            selected_ratio=aspect_ratio,
            selected_country=country,
            selected_paper_material=paper_material,
        )
        storefront_preview = ProdigiStorefrontBakeService(db).build_storefront_country_preview(
            preview_payload=preview,
            include_notice_level=include_notice_level,
        )
        preview["storefront_mode"] = (
            "include_notice_level" if include_notice_level else "primary_only"
        )
        preview["selected_country_storefront_preview"] = storefront_preview
        return preview
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/catalog-preview/create-database")
async def create_catalog_database_preview(
    admin_id: AdminDep,
    db: DBDep,
    aspect_ratio: str | None = Query(None, description="Preview ratio checkpoint"),
    country: str | None = Query(None, description="Destination country checkpoint"),
    paper_material: str | None = Query(None, description="Normalized paper material checkpoint"),
    include_notice_level: bool = Query(
        True,
        description="Whether notice-level cross-border categories should be baked into storefront tables.",
    ),
):
    """
    Materialize the curated preview into dedicated storefront bake tables.
    """
    try:
        return await ProdigiStorefrontBakeService(db).bake_storefront(
            selected_ratio=aspect_ratio,
            selected_country=country,
            selected_paper_material=paper_material,
            include_notice_level=include_notice_level,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/refresh-artwork-payloads")
async def refresh_artwork_payloads(
    admin_id: AdminDep,
    db: DBDep,
):
    """
    Rebuild the active storefront bake for all ratios/countries, materialize
    fresh per-artwork payloads, and clear runtime artwork print caches.
    """
    try:
        repository = ProdigiStorefrontRepository(db.session)
        active_bake = await repository.get_active_bake()
        config = _resolve_refresh_bake_config(active_bake)
        bake_result = await ProdigiStorefrontBakeService(db).bake_storefront(
            selected_paper_material=str(config["selected_paper_material"] or "") or None,
            include_notice_level=bool(config["include_notice_level"]),
        )
        cache_clear = await _clear_artwork_print_storefront_cache()
        return {
            "status": "refreshed",
            "message": (
                "Active storefront bake, materialized artwork payloads, and runtime "
                "artwork print caches were refreshed."
            ),
            "config": {
                "paper_material": config["selected_paper_material"],
                "include_notice_level": config["include_notice_level"],
            },
            "bake": bake_result.get("bake"),
            "artwork_storefront_materialization": bake_result.get(
                "artwork_storefront_materialization"
            ),
            "cache_clear": cache_clear,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/storefront-snapshot")
async def get_storefront_snapshot(
    admin_id: AdminDep,
    db: DBDep,
    aspect_ratio: str | None = Query(None, description="Snapshot ratio, e.g. 4:5"),
):
    """
    Dense visualization payload for the currently active baked storefront snapshot.
    Returns all countries at once for the selected ratio.
    """
    try:
        return await ProdigiStorefrontSnapshotService(db).get_snapshot_visualization(
            selected_ratio=aspect_ratio
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
