from unittest.mock import patch

patch("fastapi_cache.decorator.cache", lambda *args, **kwargs: lambda func: func).start()


import json
from datetime import datetime
from pathlib import Path

import pytest
from fastapi_cache import FastAPICache
from fastapi_cache.backends.inmemory import InMemoryBackend
from httpx import ASGITransport, AsyncClient

from src.config import settings

# Provide a dummy token so MonobankService initialization passes tests.
settings.MONOBANK_TOKEN = "dummy_test_token"
# Ensure our test admin actually has admin privileges
settings.ADMIN_EMAILS = ["test_admin@artshop.com"]
from src.database import Base, engine_null_pool, new_session_null_pool
from src.init import redis_manager
from src.main import app
from src.models import *
from src.models.orders import OrderItemOrm, OrdersOrm
from src.schemas.artworks import ArtworkAdd
from src.schemas.labels import ArtworkLabelAdd, LabelAdd, LabelCategoryAdd
from src.schemas.orders import OrderAdd
from src.schemas.users import UserAdd
from src.utils.db_manager import DBManager


class MockRedis:
    def __init__(self):
        self.data = {}

    async def get(self, key):
        return self.data.get(key)

    async def set(self, key, value, ex=None):
        self.data[key] = value

    async def delete(self, key):
        self.data.pop(key, None)

    async def incr(self, key):
        self.data[key] = self.data.get(key, 0) + 1
        return self.data[key]

    async def expire(self, key, seconds):
        pass


@pytest.fixture(scope="session", autouse=True)
def mock_redis():
    mock_r = MockRedis()
    redis_manager.redis = mock_r
    return mock_r


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
    label_categories_data = load_mock("label_categories.json")
    labels_data = load_mock("labels.json")
    artwork_labels_data = load_mock("artwork_labels.json")
    orders_data = load_mock("orders.json")

    # 4. Validate through Pydantic
    users = [UserAdd.model_validate(u) for u in users_data]
    artworks = [ArtworkAdd.model_validate(a) for a in artworks_data]
    label_categories = [LabelCategoryAdd.model_validate(c) for c in label_categories_data]
    labels = [LabelAdd.model_validate(t) for t in labels_data]
    artwork_labels = [ArtworkLabelAdd.model_validate(at) for at in artwork_labels_data]
    orders = [OrderAdd.model_validate(o) for o in orders_data]

    # 5. Insert using repositories
    async with DBManager(session_factory=new_session_null_pool) as db:
        await db.users.add_bulk(users)
        await db.label_categories.add_bulk(label_categories)
        await db.labels.add_bulk(labels)
        await db.artworks.add_bulk(artworks)
        await db.artwork_labels.add_bulk(artwork_labels)

        # Insert orders manually to handle relationships correctly
        for order_add in orders:
            order_dict = order_add.model_dump()
            items_data = order_dict.pop("items", [])
            order_orm = OrdersOrm(**order_dict)
            order_orm.items = [OrderItemOrm(**item) for item in items_data]
            db.session.add(order_orm)

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
        json={
            "email": "test_admin@artshop.com",
            "password": "password123",
            "username": "testadmin",
        },
    )
    assert response.status_code == 201


@pytest.fixture(scope="session")
async def authenticated_ac(register_user):
    """Fixture: returns a fresh AsyncClient with auth cookie (admin user)."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/auth/login",
            json={
                "email": "test_admin@artshop.com",
                "password": "password123",
            },
        )
        assert response.status_code == 200
        assert "access_token" in response.cookies
        yield client


@pytest.fixture
async def delete_all_orders(db):
    """Delete all orders before test, restore clean state after."""
    await db.order_items.delete()
    await db.orders.delete()
    await db.commit()


@pytest.fixture(scope="session", autouse=True)
async def init_cache(setup_database):
    FastAPICache.init(InMemoryBackend(), prefix="test-cache")


# pytest -v -s
