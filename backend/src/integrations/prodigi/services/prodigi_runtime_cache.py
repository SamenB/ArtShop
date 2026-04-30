from __future__ import annotations

from src.init import redis_manager

ARTWORK_PRINT_CACHE_PREFIXES = (
    "api:artwork-prints:v1:",
    "prodigi:artwork-storefront:v1:",
    "prodigi:country-storefront:v1:",
)


async def clear_artwork_print_storefront_cache() -> dict[str, object]:
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
