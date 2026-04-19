from fastapi import APIRouter, Request
import httpx
from src.init import redis_manager

router = APIRouter(prefix="/v1/geo", tags=["Geo"])

@router.get("/country")
async def get_country(request: Request):
    ip = request.client.host if request.client else "127.0.0.1"
    # If forwarded by proxy:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        ip = forwarded.split(",")[0].strip()

    if ip in ("127.0.0.1", "::1", "localhost"):
        # Default to a known country for local dev
        return {"country": "DE"}

    cache_key = f"geo:ip:{ip}"
    cached = await redis_manager.get(cache_key)
    if cached:
        return {"country": cached}

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(f"http://ip-api.com/json/{ip}?fields=countryCode")
            r.raise_for_status()
            data = r.json()
            code = data.get("countryCode", "US")
            await redis_manager.set(cache_key, code, expire=3600)
            return {"country": code}
    except Exception:
        return {"country": "US"}
