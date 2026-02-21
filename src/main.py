from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi_cache import FastAPICache
from fastapi_cache.backends.redis import RedisBackend
from fastapi.middleware.cors import CORSMiddleware
import redis.asyncio as redis
import uvicorn

from src.init import redis_manager
from src.logging_config import setup_logging
from src.config import settings
from src.api.auth import router as auth_router
from src.api.artworks import router as artworks_router, bulk_router as artworks_bulk_router
from src.api.tags import router as tags_router
from src.api.orders import router as orders_router

from sqladmin import Admin
from src.database import engine
from src.admin.auth import authentication_backend
from src.admin.views import UserAdmin, ArtworkAdmin, TagAdmin, OrderAdmin
from src.exeptions import ArtVaultExeption


setup_logging()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await redis_manager.connect()

    # Init fastapi-cache
    redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)
    FastAPICache.init(RedisBackend(redis_client), prefix="artvault-cache")

    yield

    # Shutdown
    await redis_manager.close()


app = FastAPI(title="ArtVault", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,  # Allows explicit origins
    allow_credentials=True,               # Needs to be True for HTTPOnly Auth Cookies
    allow_methods=["*"],                  # Allows all methods (GET, POST, etc.)
    allow_headers=["*"],                  # Allows all headers
)

@app.exception_handler(ArtVaultExeption)
async def artvault_exception_handler(request: Request, exc: ArtVaultExeption):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
    )

app.mount("/static", StaticFiles(directory="static"), name="static")

app.include_router(auth_router)
app.include_router(artworks_router)
app.include_router(artworks_bulk_router)
app.include_router(tags_router)
app.include_router(orders_router)


admin = Admin(app, engine, authentication_backend=authentication_backend, templates_dir="src/templates")
admin.add_view(UserAdmin)
admin.add_view(ArtworkAdmin)
admin.add_view(TagAdmin)
admin.add_view(OrderAdmin)

if __name__ == "__main__":
    uvicorn.run(app="src.main:app", reload=True)

