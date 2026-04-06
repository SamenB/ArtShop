"""
Redis-based rate limiter для auth эндпоинтов.

Логика:
- Ключ в Redis: `rate_limit:{endpoint_name}:{client_ip}`
- При каждом запросе инкрементируем счётчик
- Первый запрос — устанавливаем TTL (окно)
- Если счётчик > лимит — бросаем RateLimitExceededException

Окна:
  /auth/login    → 5 попыток за 15 минут (защита от bruteforce)
  /auth/register → 10 попыток за 1 час (защита от mass registration)
  /auth/google   → 10 попыток за 5 минут
"""

from fastapi import Request

from src.exeptions import RateLimitExceededException
from src.init import redis_manager


async def check_rate_limit(
    request: Request, endpoint: str, max_requests: int, window_seconds: int
) -> None:
    """
    Проверяет rate limit для заданного endpoint + IP.

    Args:
        request: FastAPI Request (для получения IP клиента)
        endpoint: Уникальное имя ключа (например "login")
        max_requests: Максимум запросов в окне
        window_seconds: Длина окна в секундах
    """
    # Берём реальный IP (учитываем X-Forwarded-For от Nginx)
    forwarded_for = request.headers.get("X-Forwarded-For")
    client_ip = (
        forwarded_for.split(",")[0].strip()
        if forwarded_for
        else (request.client.host if request.client else "unknown")
    )

    key = f"rate_limit:{endpoint}:{client_ip}"

    # Инкрементируем счётчик атомарно
    count = await redis_manager.redis.incr(key)

    # На первом запросе устанавливаем TTL (expire)
    if count == 1:
        await redis_manager.redis.expire(key, window_seconds)

    if count > max_requests:
        raise RateLimitExceededException
