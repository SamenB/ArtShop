from types import SimpleNamespace

import pytest

from src.api.admin_prodigi import (
    ARTWORK_PRINT_CACHE_PREFIXES,
    _clear_artwork_print_storefront_cache,
    _resolve_refresh_bake_config,
)
from src.init import redis_manager


class DummyRedis:
    def __init__(self, data: dict[str, str]):
        self.data = dict(data)

    async def delete(self, key: str):
        self.data.pop(key, None)


def test_resolve_refresh_bake_config_uses_active_bake_settings():
    config = _resolve_refresh_bake_config(
        SimpleNamespace(
            paper_material="hahnemuhle_photo_rag",
            include_notice_level=False,
        )
    )

    assert config == {
        "selected_paper_material": "hahnemuhle_photo_rag",
        "include_notice_level": False,
    }


def test_resolve_refresh_bake_config_defaults_when_no_active_bake():
    config = _resolve_refresh_bake_config(None)

    assert config == {
        "selected_paper_material": None,
        "include_notice_level": True,
    }


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
