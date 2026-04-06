"""
Redis-based rate limiter for authentication endpoints.

Logic:
- Redis key: `rate_limit:{endpoint_name}:{client_ip}`
- On every request, the counter is incremented.
- On the first request, a TTL (window) is set.
- If the counter exceeds the limit, a RateLimitExceededException is raised.

Default Windows:
  /auth/login    -> 5 attempts per 15 minutes (bruteforce protection)
  /auth/register -> 10 attempts per 1 hour (mass registration protection)
  /auth/google   -> 10 attempts per 5 minutes
"""

from fastapi import Request

from src.exeptions import RateLimitExceededException
from src.init import redis_manager


async def check_rate_limit(
    request: Request, endpoint: str, max_requests: int, window_seconds: int
) -> None:
    """
    Checks the rate limit for a given endpoint and client IP.

    Args:
        request: FastAPI Request object (to determine client IP).
        endpoint: Unique key name for the rate limit (e.g., "login").
        max_requests: Maximum number of allowed requests within the window.
        window_seconds: The length of the time window in seconds.
    """
    # Determine the real IP address, accounting for X-Forwarded-For if behind a proxy like Nginx.
    forwarded_for = request.headers.get("X-Forwarded-For")
    client_ip = (
        forwarded_for.split(",")[0].strip()
        if forwarded_for
        else (request.client.host if request.client else "unknown")
    )

    key = f"rate_limit:{endpoint}:{client_ip}"

    # Increment the counter atomically.
    # Note: We use the raw redis client here because RedisManager's incr isn't explicitly defined.
    # Ensure redis_manager.redis is initialized (linked to lifespan startup).
    assert redis_manager.redis is not None
    count = await redis_manager.redis.incr(key)

    # Set TTL (expiration) on the first request of the window.
    if count == 1:
        await redis_manager.redis.expire(key, window_seconds)

    # Raise exception if the rate limit is exceeded.
    if count > max_requests:
        raise RateLimitExceededException
