from unittest.mock import patch

patch("fastapi_cache.decorator.cache", lambda *args, **kwargs: lambda func: func).start()


import pytest
from httpx import ASGITransport, AsyncClient
import json
from pathlib import Path
from datetime import datetime
from fastapi_cache import FastAPICache
from fastapi_cache.backends.inmemory import InMemoryBackend

from src.main import app
from src.database import Base, engine_null_pool, new_session_null_pool
from src.models import *
from src.config import settings
from src.utils.db_manager import DBManager
from src.schemas.users import UserAdd
from src.schemas.artworks import ArtworkAdd
from src.schemas.tags import TagAdd, ArtworkTagAdd
from src.schemas.orders import OrderAdd


MOCKS_DIR = Path(__file__).parent / "mocks"


def load_mock(filename: str) -> list[dict]:
    with open(MOCKS_DIR / filename, "r", encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture(scope="function")
async def db():
    async with DBManager(session_factory=new_session_null_pool) as db:
        yield db


@pytest.fixture(scope="session", autouse=True)
async def check_test_mode():
    assert settings.MODE == "TEST"


@pytest.fixture(scope="session", autouse=True)
async def setup_database(check_test_mode):
    # 1. Drop and create tables
    async with engine_null_pool.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    # 2. Load mock data from JSON
    users_data = load_mock("users.json")
    artworks_data = load_mock("artworks.json")
    tags_data = load_mock("tags.json")
    artwork_tags_data = load_mock("artwork_tags.json")
    orders_data = load_mock("orders.json")


    # 4. Validate through Pydantic
    users = [UserAdd.model_validate(u) for u in users_data]
    artworks = [ArtworkAdd.model_validate(a) for a in artworks_data]
    tags = [TagAdd.model_validate(t) for t in tags_data]
    artwork_tags = [ArtworkTagAdd.model_validate(at) for at in artwork_tags_data]
    orders = [OrderAdd.model_validate(o) for o in orders_data]

    # 5. Insert using repositories
    async with DBManager(session_factory=new_session_null_pool) as db:
        await db.users.add_bulk(users)
        await db.tags.add_bulk(tags)
        await db.artworks.add_bulk(artworks)
        await db.artwork_tags.add_bulk(artwork_tags)
        await db.orders.add_bulk(orders)
        await db.commit()


@pytest.fixture(scope="session")
async def ac():
    """Async HTTP client for testing API endpoints."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client


@pytest.fixture(scope="session", autouse=True)
async def register_user(ac, setup_database):
    response = await ac.post(
        url="/auth/register",
        json={"email": "qwerty@123.com", "password": "password", "username": "qwerty"},
    )
    assert response.status_code == 200


@pytest.fixture(scope="session")
async def authenticated_ac(register_user, ac):
    """Fixture: returns AsyncClient with auth cookie."""
    response = await ac.post(
        "/auth/login",
        json={
            "email": "qwerty@123.com",
            "password": "password",
        },
    )
    assert response.status_code == 200
    assert "access_token" in response.cookies
    return ac


@pytest.fixture
async def delete_all_orders(db):
    """Delete all orders before test, restore clean state after."""
    await db.orders.delete()
    await db.commit()


@pytest.fixture(scope="session", autouse=True)
async def init_cache(setup_database):
    FastAPICache.init(InMemoryBackend(), prefix="test-cache")


# pytest -v -s
