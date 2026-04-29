from fastapi import APIRouter, Body, HTTPException, Query
from sqlalchemy import func, select

from src.api.dependencies import AdminDep, DBDep
from src.config import settings
from src.init import redis_manager
from src.integrations.prodigi.api.print_options import MARKUP
from src.integrations.prodigi.connectors.client import ProdigiClient
from src.integrations.prodigi.repositories.prodigi_storefront import ProdigiStorefrontRepository
from src.integrations.prodigi.services.prodigi_artwork_storefront_materializer import (
    ProdigiArtworkStorefrontMaterializerService,
)
from src.integrations.prodigi.services.prodigi_catalog import ProdigiCatalogService
from src.integrations.prodigi.services.prodigi_catalog_preview import ProdigiCatalogPreviewService
from src.integrations.prodigi.services.prodigi_fulfillment_retry import (
    ProdigiFulfillmentRetryService,
)
from src.integrations.prodigi.services.prodigi_fulfillment_validation import (
    KEY_COUNTRIES,
    ProdigiFulfillmentValidationService,
    ValidationConfig,
    ValidationThresholds,
)
from src.integrations.prodigi.services.prodigi_storefront_bake import ProdigiStorefrontBakeService
from src.integrations.prodigi.services.prodigi_storefront_settings import (
    ProdigiStorefrontSettingsService,
)
from src.integrations.prodigi.services.prodigi_storefront_snapshot import (
    ProdigiStorefrontSnapshotService,
)
from src.models.prodigi_fulfillment import (
    ProdigiFulfillmentEventOrm,
    ProdigiFulfillmentGateResultOrm,
    ProdigiFulfillmentJobOrm,
)

router = APIRouter(prefix="/v1/admin/prodigi", tags=["Admin Prodigi Diagnostics"])
catalog_service = ProdigiCatalogService()
ARTWORK_PRINT_CACHE_PREFIXES = (
    "api:artwork-prints:v1:",
    "prodigi:artwork-storefront:v1:",
    "prodigi:country-storefront:v1:",
)


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


@router.get("/storefront-settings")
async def get_storefront_settings(admin_id: AdminDep, db: DBDep):
    return await ProdigiStorefrontSettingsService(db).build_admin_payload()


@router.put("/storefront-settings")
async def update_storefront_settings(
    admin_id: AdminDep,
    db: DBDep,
    payload: dict = Body(...),
):
    try:
        await ProdigiStorefrontSettingsService(db).save_config(payload)
        cache_clear = await _clear_artwork_print_storefront_cache()
        response = await ProdigiStorefrontSettingsService(db).build_admin_payload()
        response["cache_clear"] = cache_clear
        return response
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/storefront-settings/rebuild-payload")
async def rebuild_storefront_payload(admin_id: AdminDep, db: DBDep):
    try:
        repository = ProdigiStorefrontRepository(db.session)
        active_bake = await repository.get_active_bake()
        if active_bake is None:
            raise HTTPException(
                status_code=400,
                detail="No active storefront bake exists yet. Rebuild snapshot first.",
            )
        materialization = await ProdigiArtworkStorefrontMaterializerService(
            db
        ).materialize_active_bake()
        cache_clear = await _clear_artwork_print_storefront_cache()
        settings_payload = await ProdigiStorefrontSettingsService(db).build_admin_payload()
        return {
            "status": "rebuilt_payload",
            "bake": {
                "id": active_bake.id,
                "bake_key": active_bake.bake_key,
                "paper_material": active_bake.paper_material,
                "include_notice_level": active_bake.include_notice_level,
            },
            "artwork_storefront_materialization": materialization,
            "cache_clear": cache_clear,
            "settings": settings_payload,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/storefront-settings/rebuild-snapshot")
async def rebuild_storefront_snapshot(admin_id: AdminDep, db: DBDep):
    try:
        config = await ProdigiStorefrontSettingsService(db).get_effective_config()
        snapshot_defaults = config["snapshot_defaults"]
        bake_result = await ProdigiStorefrontBakeService(db).bake_storefront(
            selected_paper_material=snapshot_defaults["paper_material"],
            include_notice_level=snapshot_defaults["include_notice_level"],
        )
        cache_clear = await _clear_artwork_print_storefront_cache()
        settings_payload = await ProdigiStorefrontSettingsService(db).build_admin_payload()
        return {
            "status": "rebuilt_snapshot_and_payload",
            "bake": bake_result,
            "cache_clear": cache_clear,
            "settings": settings_payload,
        }
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/fulfillment/jobs")
async def get_fulfillment_jobs(
    admin_id: AdminDep,
    db: DBDep,
    status: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
):
    stmt = (
        select(ProdigiFulfillmentJobOrm)
        .order_by(ProdigiFulfillmentJobOrm.updated_at.desc())
        .limit(limit)
    )
    if status:
        stmt = stmt.where(ProdigiFulfillmentJobOrm.status == status)
    jobs = list((await db.session.execute(stmt)).scalars().all())

    counts = (
        await db.session.execute(
            select(ProdigiFulfillmentJobOrm.status, func.count())
            .group_by(ProdigiFulfillmentJobOrm.status)
            .order_by(ProdigiFulfillmentJobOrm.status)
        )
    ).all()
    return {
        "mode": "sandbox" if settings.PRODIGI_SANDBOX else "live",
        "webhook_secret_configured": bool(settings.PRODIGI_WEBHOOK_SECRET),
        "counts": {row[0]: int(row[1]) for row in counts},
        "jobs": [_serialize_job(job) for job in jobs],
    }


@router.get("/fulfillment/jobs/{job_id}")
async def get_fulfillment_job_detail(admin_id: AdminDep, db: DBDep, job_id: int):
    job = (
        await db.session.execute(
            select(ProdigiFulfillmentJobOrm).where(ProdigiFulfillmentJobOrm.id == job_id).limit(1)
        )
    ).scalar_one_or_none()
    if job is None:
        raise HTTPException(status_code=404, detail="Fulfillment job not found")

    gates = list(
        (
            await db.session.execute(
                select(ProdigiFulfillmentGateResultOrm)
                .where(ProdigiFulfillmentGateResultOrm.job_id == job_id)
                .order_by(ProdigiFulfillmentGateResultOrm.created_at.asc())
            )
        )
        .scalars()
        .all()
    )
    events = list(
        (
            await db.session.execute(
                select(ProdigiFulfillmentEventOrm)
                .where(ProdigiFulfillmentEventOrm.job_id == job_id)
                .order_by(ProdigiFulfillmentEventOrm.created_at.asc())
            )
        )
        .scalars()
        .all()
    )
    return {
        "job": _serialize_job(job),
        "gates": [_serialize_gate(gate) for gate in gates],
        "events": [_serialize_event(event) for event in events],
    }


@router.post("/fulfillment/jobs/{job_id}/retry")
async def retry_fulfillment_job(
    admin_id: AdminDep,
    db: DBDep,
    job_id: int,
    force: bool = Query(False),
):
    return await ProdigiFulfillmentRetryService(db.session).retry_job(job_id, force=force)


@router.post("/fulfillment/retry")
async def retry_fulfillment_jobs(
    admin_id: AdminDep,
    db: DBDep,
    limit: int = Query(20, ge=1, le=100),
):
    return await ProdigiFulfillmentRetryService(db.session).retry_pending(limit=limit)


@router.post("/fulfillment/validation-report")
async def run_fulfillment_validation_report(
    admin_id: AdminDep,
    db: DBDep,
    country: list[str] | None = Query(None),
    max_sizes_per_group: int = Query(1, ge=0, le=20),
    simulate_orders: int = Query(100, ge=1, le=5000),
    batch_size: int = Query(3, ge=1, le=20),
    include_api_checks: bool = Query(False),
    include_quotes: bool = Query(False),
    require_api_checks: bool = Query(False),
    max_failures: int = Query(0, ge=0),
    min_pass_rate: float = Query(1.0, ge=0.0, le=1.0),
):
    return await ProdigiFulfillmentValidationService(db.session).run(
        ValidationConfig(
            countries=country or KEY_COUNTRIES,
            max_sizes_per_group=max_sizes_per_group,
            simulate_orders=simulate_orders,
            batch_size=batch_size,
            include_api_checks=include_api_checks,
            include_quotes=include_quotes,
            thresholds=ValidationThresholds(
                min_samples=1,
                min_simulated_orders=simulate_orders,
                max_failures=max_failures,
                min_pass_rate=min_pass_rate,
                require_api_checks=require_api_checks,
            ),
        )
    )


def _serialize_job(job: ProdigiFulfillmentJobOrm) -> dict:
    return {
        "id": job.id,
        "order_id": job.order_id,
        "provider_key": job.provider_key,
        "status": job.status,
        "mode": job.mode,
        "merchant_reference": job.merchant_reference,
        "idempotency_key": job.idempotency_key,
        "prodigi_order_id": job.prodigi_order_id,
        "attempt_count": job.attempt_count,
        "item_ids": job.item_ids,
        "payload_hash": job.payload_hash,
        "last_error": job.last_error,
        "created_at": job.created_at,
        "updated_at": job.updated_at,
    }


def _serialize_gate(gate: ProdigiFulfillmentGateResultOrm) -> dict:
    return {
        "id": gate.id,
        "order_id": gate.order_id,
        "order_item_id": gate.order_item_id,
        "gate": gate.gate,
        "status": gate.status,
        "measured": gate.measured,
        "expected": gate.expected,
        "error": gate.error,
        "created_at": gate.created_at,
    }


def _serialize_event(event: ProdigiFulfillmentEventOrm) -> dict:
    return {
        "id": event.id,
        "order_id": event.order_id,
        "order_item_id": event.order_item_id,
        "event_type": event.event_type,
        "stage": event.stage,
        "status": event.status,
        "external_id": event.external_id,
        "metadata": event.metadata_json,
        "error": event.error,
        "created_at": event.created_at,
    }


@router.get("/probe")
async def probe_prodigi(
    admin_id: AdminDep,
    country: str = Query(..., description="ISO 3166-1 alpha-2, e.g. DE"),
    aspect_ratio: str = Query(..., description="Normalised portrait ratio, e.g. 2:3"),
    family: str = Query("GLOBAL-HPR", description="Prodigi SKU prefix e.g. GLOBAL-HPR, GLOBAL-CAN"),
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
                tier["total_retail_eur"] = round(
                    tier["retail_product_eur"] + tier["shipping_cost_eur"], 2
                )

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
async def get_raw_sku(admin_id: AdminDep, sku: str = Query(...)):
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
    attributes: str = Query("{}"),
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
    paper_material: str | None = Query(
        None, description="Normalized paper material, e.g. hahnemuhle_german_etching"
    ),
    include_notice_level: bool | None = Query(
        None,
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
        bake_service = ProdigiStorefrontBakeService(db)
        await bake_service.load_storefront_settings()
        effective_include_notice = include_notice_level
        if effective_include_notice is None:
            settings_config = await ProdigiStorefrontSettingsService(db).get_effective_config()
            effective_include_notice = settings_config["snapshot_defaults"]["include_notice_level"]
        storefront_preview = bake_service.build_storefront_country_preview(
            preview_payload=preview,
            include_notice_level=effective_include_notice,
        )
        preview["storefront_mode"] = (
            "include_notice_level" if effective_include_notice else "primary_only"
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
    include_notice_level: bool | None = Query(
        None,
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
    Rematerialize per-artwork storefront payloads from the already active bake
    and clear runtime artwork print caches.
    """
    try:
        repository = ProdigiStorefrontRepository(db.session)
        active_bake = await repository.get_active_bake()
        if active_bake is None:
            raise HTTPException(
                status_code=400,
                detail=(
                    "No active storefront bake exists yet. Build or activate a bake in "
                    "Prodigi Hub before refreshing artwork payloads."
                ),
            )

        materialization = await ProdigiArtworkStorefrontMaterializerService(
            db
        ).materialize_active_bake()
        cache_clear = await _clear_artwork_print_storefront_cache()
        return {
            "status": "refreshed",
            "message": (
                "Artwork payloads were regenerated from the active storefront bake "
                "and runtime artwork print caches were cleared."
            ),
            "bake": {
                "id": active_bake.id,
                "bake_key": active_bake.bake_key,
                "paper_material": active_bake.paper_material,
                "include_notice_level": active_bake.include_notice_level,
            },
            "artwork_storefront_materialization": materialization,
            "cache_clear": cache_clear,
        }
    except HTTPException:
        raise
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
