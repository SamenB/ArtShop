from contextlib import asynccontextmanager

import redis.asyncio as redis
import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi_cache import FastAPICache
from fastapi_cache.backends.redis import RedisBackend

from src.api.artworks import bulk_router as artworks_bulk_router
from src.api.artworks import router as artworks_router
from src.api.auth import router as auth_router
from src.api.collections import router as collections_router
from src.api.orders import router as orders_router
from src.api.settings import router as settings_router
from src.api.tags import router as tags_router
from src.api.upload import router as upload_router
from src.api.users import router as users_router
from src.api.contact import router as contact_router
from src.config import settings
from src.exeptions import ArtShopExeption
from src.init import redis_manager
from src.logging_config import setup_logging

setup_logging()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await redis_manager.connect()

    # Init fastapi-cache
    redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)
    FastAPICache.init(RedisBackend(redis_client), prefix="artshop-cache")

    yield

    # Shutdown
    await redis_manager.close()


app = FastAPI(title="ArtShop", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,  # Allows explicit configuration
    # Allow any local network IP for testing on phones/other devices:
    allow_origin_regex=r"^https?://(?:localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(?::\d+)?$",
    allow_credentials=True,  # Needs to be True for HTTPOnly Auth Cookies
    allow_methods=["*"],  # Allows all methods (GET, POST, etc.)
    allow_headers=["*"],  # Allows all headers
)


@app.exception_handler(ArtShopExeption)
async def artshop_exception_handler(request: Request, exc: ArtShopExeption):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
    )


from loguru import logger


@app.middleware("http")
async def log_requests(request: Request, call_next):
    logger.debug(
        "Request: {} {} Origin: {}", request.method, request.url, request.headers.get("origin")
    )
    response = await call_next(request)
    return response


app.mount("/static", StaticFiles(directory="static"), name="static")

app.include_router(auth_router)
app.include_router(artworks_router)
app.include_router(artworks_bulk_router)
app.include_router(tags_router)
app.include_router(orders_router)
app.include_router(users_router)
app.include_router(settings_router)
app.include_router(upload_router)
app.include_router(collections_router)
app.include_router(contact_router)

if __name__ == "__main__":
    uvicorn.run(app="src.main:app", host="0.0.0.0", port=8000, reload=True)
