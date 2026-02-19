from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi_cache import FastAPICache
from fastapi_cache.backends.redis import RedisBackend
import redis.asyncio as redis
import uvicorn

from src.init import redis_manager
from src.logging_config import setup_logging
from src.config import settings
from src.api.auth import router as auth_router
from src.api.collections import router as collections_router
from src.api.artworks import router as artworks_router, bulk_router as artworks_bulk_router
from src.api.tags import router as tags_router
from src.api.orders import router as orders_router

from sqladmin import Admin
from src.database import engine
from src.admin.auth import authentication_backend
from src.admin.views import UserAdmin, ArtworkAdmin, CollectionAdmin, TagAdmin, OrderAdmin


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

app.mount("/static", StaticFiles(directory="static"), name="static")

app.include_router(auth_router)
app.include_router(collections_router)
app.include_router(artworks_router)
app.include_router(artworks_bulk_router)
app.include_router(tags_router)
app.include_router(orders_router)


admin = Admin(app, engine, authentication_backend=authentication_backend)
admin.add_view(UserAdmin)
admin.add_view(ArtworkAdmin)
admin.add_view(CollectionAdmin)
admin.add_view(TagAdmin)
admin.add_view(OrderAdmin)

if __name__ == "__main__":
    uvicorn.run(app="src.main:app", reload=True)

