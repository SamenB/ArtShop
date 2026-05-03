from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from src.init import redis_manager
from src.integrations.prodigi.api.admin_prodigi import (
    ARTWORK_PRINT_CACHE_PREFIXES,
    _clear_artwork_print_storefront_cache,
    refresh_artwork_payloads,
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
