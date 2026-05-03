from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from src.init import redis_manager
from src.integrations.prodigi.api.admin_prodigi import (
    ARTWORK_PRINT_CACHE_PREFIXES,
    _clear_artwork_print_storefront_cache,
    get_production_prepare_status,
    refresh_artwork_payloads,
    run_production_prepare,
)


class DummyRedis:
    def __init__(self, data: dict[str, str]):
        self.data = dict(data)

    async def delete(self, key: str):
        self.data.pop(key, None)


@pytest.mark.asyncio
async def test_clear_artwork_print_storefront_cache_removes_only_prefixed_keys():
    previous = redis_manager.redis
    redis_manager.redis = DummyRedis(
        {
            f"{ARTWORK_PRINT_CACHE_PREFIXES[0]}42:DE": "payload-1",
            f"{ARTWORK_PRINT_CACHE_PREFIXES[0]}portrait-work:US": "payload-2",
            f"{ARTWORK_PRINT_CACHE_PREFIXES[1]}7:DE:abc123": "payload-3",
            "geo:country:test": "UA",
        }
    )

    try:
        result = await _clear_artwork_print_storefront_cache()
    finally:
        remaining = dict(redis_manager.redis.data)
        redis_manager.redis = previous

    assert result == {
        "status": "cleared",
        "deleted_keys": 3,
    }
    assert remaining == {"geo:country:test": "UA"}


@pytest.mark.asyncio
async def test_clear_artwork_print_storefront_cache_skips_when_redis_missing():
    previous = redis_manager.redis
    redis_manager.redis = None

    try:
        result = await _clear_artwork_print_storefront_cache()
    finally:
        redis_manager.redis = previous

    assert result == {
        "status": "skipped",
        "deleted_keys": 0,
        "reason": "Redis is not connected.",
    }


@pytest.mark.asyncio
async def test_refresh_artwork_payloads_rematerializes_active_bake(monkeypatch):
    active_bake = SimpleNamespace(
        id=7,
        bake_key="active-bake",
        paper_material="hahnemuhle_photo_rag",
        include_notice_level=True,
    )

    class DummyRepository:
        def __init__(self, session):
            self.session = session

        async def get_active_bake(self):
            return active_bake

    class DummyMaterializer:
        def __init__(self, db):
            self.db = db

        async def materialize_active_bake(self):
            return {
                "status": "materialized",
                "bake_id": active_bake.id,
                "artwork_count": 1,
                "payload_count": 152,
                "country_count": 152,
            }

    async def fake_clear():
        return {"status": "cleared", "deleted_keys": 2}

    monkeypatch.setattr(
        "src.integrations.prodigi.api.admin_prodigi.ProdigiStorefrontRepository",
        DummyRepository,
    )
    monkeypatch.setattr(
        "src.integrations.prodigi.api.admin_prodigi.ProdigiArtworkStorefrontMaterializerService",
        DummyMaterializer,
    )
    monkeypatch.setattr(
        "src.integrations.prodigi.api.admin_prodigi._clear_artwork_print_storefront_cache",
        fake_clear,
    )

    result = await refresh_artwork_payloads(
        admin_id=1,
        db=SimpleNamespace(session=object()),
    )

    assert result == {
        "status": "refreshed",
        "message": (
            "Artwork payloads were regenerated from the active storefront bake "
            "and runtime artwork print caches were cleared."
        ),
        "bake": {
            "id": 7,
            "bake_key": "active-bake",
            "paper_material": "hahnemuhle_photo_rag",
            "include_notice_level": True,
        },
        "artwork_storefront_materialization": {
            "status": "materialized",
            "bake_id": 7,
            "artwork_count": 1,
            "payload_count": 152,
            "country_count": 152,
        },
        "cache_clear": {
            "status": "cleared",
            "deleted_keys": 2,
        },
    }


@pytest.mark.asyncio
async def test_refresh_artwork_payloads_requires_active_bake(monkeypatch):
    class DummyRepository:
        def __init__(self, session):
            self.session = session

        async def get_active_bake(self):
            return None

    monkeypatch.setattr(
        "src.integrations.prodigi.api.admin_prodigi.ProdigiStorefrontRepository",
        DummyRepository,
    )

    with pytest.raises(HTTPException) as exc_info:
        await refresh_artwork_payloads(
            admin_id=1,
            db=SimpleNamespace(session=object()),
        )

    assert exc_info.value.status_code == 400
    assert "No active storefront bake exists yet." in str(exc_info.value.detail)


class _Decision:
    def __init__(self, prepare_needed: bool, reasons: list[str] | None = None):
        self.prepare_needed = prepare_needed
        self.status = "needed" if prepare_needed else "skipped"
        self.reasons = reasons or []

    def as_dict(self):
        return {
            "prepare_needed": self.prepare_needed,
            "status": self.status,
            "reasons": self.reasons,
            "source": {"rows_seen": 2, "size_bytes": 50, "sha256": "abc"},
            "active_bake": None,
            "materialized_payload_count": 0,
            "expected": {"pipeline_version": "pipeline", "policy_version": "policy"},
        }


@pytest.mark.asyncio
async def test_get_production_prepare_status_uses_decider(monkeypatch):
    class DummyDecider:
        force_values = []

        def __init__(self, session):
            self.session = session

        async def evaluate(self, *, force=False):
            self.force_values.append(force)
            return _Decision(True, ["materialized_payloads_missing"])

    monkeypatch.setattr(
        "src.integrations.prodigi.api.admin_prodigi.ProdigiProductionPrepareDecider",
        DummyDecider,
    )

    result = await get_production_prepare_status(
        admin_id=1,
        db=SimpleNamespace(session=object()),
        force=True,
    )

    assert result["prepare_needed"] is True
    assert result["reasons"] == ["materialized_payloads_missing"]
    assert DummyDecider.force_values == [True]


@pytest.mark.asyncio
async def test_run_production_prepare_skips_when_decider_is_current(monkeypatch):
    class DummyDecider:
        def __init__(self, session):
            self.session = session

        async def evaluate(self, *, force=False):
            return _Decision(False)

    class FailingPrepareService:
        def __init__(self, db):
            self.db = db

        async def run(self, options):
            raise AssertionError("prepare should not run when decider skips")

    monkeypatch.setattr(
        "src.integrations.prodigi.api.admin_prodigi.ProdigiProductionPrepareDecider",
        DummyDecider,
    )
    monkeypatch.setattr(
        "src.integrations.prodigi.api.admin_prodigi.ProdigiProductionPrepareService",
        FailingPrepareService,
    )

    result = await run_production_prepare(
        admin_id=1,
        db=SimpleNamespace(session=object()),
        payload={},
    )

    assert result["status"] == "skipped"
    assert result["report"] is None


@pytest.mark.asyncio
async def test_run_production_prepare_uses_settings_defaults_and_returns_report(monkeypatch):
    decisions = [_Decision(True, ["source_sha256_changed"]), _Decision(False)]
    captured_options = []

    class DummyDecider:
        def __init__(self, session):
            self.session = session

        async def evaluate(self, *, force=False):
            return decisions.pop(0)

    class DummySettingsService:
        def __init__(self, db):
            self.db = db

        async def get_effective_config(self):
            return {
                "snapshot_defaults": {
                    "paper_material": "hahnemuhle_german_etching",
                    "include_notice_level": False,
                }
            }

        async def build_admin_payload(self):
            return {"status": {"materialized_payload_count": 12}}

    class DummyPrepareService:
        def __init__(self, db):
            self.db = db

        async def run(self, options):
            captured_options.append(options)
            return {
                "status": "ready",
                "validation": {"approved": True},
                "cache_clear": {"status": "cleared"},
                "csv_rebuild": {"bake": {"id": 9}},
            }

    monkeypatch.setattr(
        "src.integrations.prodigi.api.admin_prodigi.ProdigiProductionPrepareDecider",
        DummyDecider,
    )
    monkeypatch.setattr(
        "src.integrations.prodigi.api.admin_prodigi.ProdigiStorefrontSettingsService",
        DummySettingsService,
    )
    monkeypatch.setattr(
        "src.integrations.prodigi.api.admin_prodigi.ProdigiProductionPrepareService",
        DummyPrepareService,
    )

    result = await run_production_prepare(
        admin_id=1,
        db=SimpleNamespace(session=object()),
        payload={"include_api_checks": True, "simulate_orders": 5},
    )

    assert result["status"] == "ready"
    assert result["settings"] == {"status": {"materialized_payload_count": 12}}
    assert result["refreshed_decision"]["status"] == "skipped"
    assert captured_options[0].selected_paper_material == "hahnemuhle_german_etching"
    assert captured_options[0].include_notice_level is False
    assert captured_options[0].include_api_checks is True
    assert captured_options[0].simulate_orders == 5
