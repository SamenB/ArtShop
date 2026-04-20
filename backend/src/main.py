"""
Main application entry point for the ArtShop backend.
Configures the FastAPI instance, manages lifecycle events (lifespan),
registers global middleware (CORS, logging), and orchestrates API routing.
"""

from contextlib import asynccontextmanager

import redis.asyncio as redis
import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi_cache import FastAPICache
from fastapi_cache.backends.redis import RedisBackend
from loguru import logger

from src.api.artworks import bulk_router as artworks_bulk_router
from src.api.artworks import router as artworks_router
from src.api.auth import router as auth_router
from src.api.contact import router as contact_router
from src.api.email_templates import router as email_templates_router
from src.api.labels import router as labels_router
from src.api.orders import router as orders_router
from src.api.payments import router as payments_router
from src.api.print_pricing import router as print_pricing_router
from src.api.settings import router as settings_router
from src.api.telegram import router as telegram_router
from src.api.upload import router as upload_router
from src.api.users import router as users_router
from src.config import settings
from src.exeptions import ArtShopExeption
from src.init import redis_manager
from src.logging_config import setup_logging

# Initialize global logging configuration immediately upon module load.
setup_logging()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Asynchronous context manager for the FastAPI application lifecycle.

    Startup:
    - Establishes connection to the Redis server.
    - Initializes the application-wide cache (FastAPICache) using Redis.

    Shutdown:
    - Gracefully closes Redis connections.
    """
    # Initialize shared resources.
    await redis_manager.connect()

    # Configure Redis client for caching purposes.
    redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)
    FastAPICache.init(RedisBackend(redis_client), prefix="artshop-cache")

    yield

    # Clean up resources during application shutdown.
    await redis_manager.close()


# Instantiate the core FastAPI application.
app = FastAPI(title="ArtShop", lifespan=lifespan)

# CORS (Cross-Origin Resource Sharing) middleware configuration.
# Enables secure communication between the frontend and backend.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    # Matches local network patterns to support mobile testing and local development.
    allow_origin_regex=r"^https?://(?:localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(?::\d+)?$",
    allow_credentials=True,  # Required for HTTPOnly authentication cookies.
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(ArtShopExeption)
async def artshop_exception_handler(request: Request, exc: ArtShopExeption):
    """
    Global exception mapper for internal 'ArtShopExeption' types.
    Ensures all domain-specific errors return a consistent JSON structure to the client.
    """
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
    )


@app.middleware("http")
async def log_requests(request: Request, call_next):
    """
    Per-request HTTP middleware for debugging and audit logging.
    Captures request methods, target URLs, and origin headers.
    """
    logger.debug(
        "Incoming Request: {} {} | Origin: {}",
        request.method,
        request.url,
        request.headers.get("origin"),
    )
    response = await call_next(request)
    return response


# Mount a directory for serving static assets (e.g., artwork images, generated thumbnails).
app.mount("/static", StaticFiles(directory="static"), name="static")

from src.api.print_options import router as print_options_router
from src.api.geo import router as geo_router
from src.api.prodigi_callbacks import router as prodigi_callbacks_router
from src.api.admin_prodigi import router as admin_prodigi_router

# Register all domain-specific API routers.
app.include_router(auth_router)
app.include_router(artworks_router)
app.include_router(artworks_bulk_router)
app.include_router(labels_router)
app.include_router(orders_router)
app.include_router(payments_router)
app.include_router(users_router)
app.include_router(settings_router)
app.include_router(upload_router)
app.include_router(contact_router)
app.include_router(email_templates_router)
app.include_router(print_pricing_router)
app.include_router(telegram_router)
app.include_router(print_options_router)
app.include_router(geo_router)
app.include_router(prodigi_callbacks_router)
app.include_router(admin_prodigi_router)

if __name__ == "__main__":
    # Local development server execution.
    uvicorn.run(app="src.main:app", host="0.0.0.0", port=8000, reload=True)
