import pytest
from datetime import date

from src.schemas.orders import OrderAdd


# ============ FIXTURES ============


@pytest.fixture(scope="function")
async def test_ids(db):
    """Fixture: returns (user_id, artwork_id, collection_id) for tests."""
    user_id = (await db.users.get_all())[0].id
    artwork_id = (await db.artworks.get_all())[0].id
    collection_id = (
        await db.collections.get_all(title=None, location=None, limit=1, offset=0)
    )[0].id
    return user_id, artwork_id, collection_id


@pytest.fixture(scope="function")
async def sample_order(db, test_ids):
    """Fixture: creates and returns an order for tests that need existing data."""
    user_id, artwork_id, collection_id = test_ids

    order_data = OrderAdd(
        user_id=user_id,
        artwork_id=artwork_id,
        collection_id=collection_id,
        price=2000,
    )

    created = await db.orders.add(order_data)
    await db.commit()
    return created


# ============ TESTS ============


async def test_create_order(db, test_ids):
    """Test order creation."""
    user_id, artwork_id, collection_id = test_ids

    order_data = OrderAdd(
        user_id=user_id,
        artwork_id=artwork_id,
        collection_id=collection_id,
        price=1500,
    )

    result = await db.orders.add(order_data)
    await db.commit()

    assert result.id is not None
    assert result.user_id == user_id
    assert result.price == 1500


async def test_read_order(db, sample_order):
    """Test reading order by ID."""
    fetched = await db.orders.get_one_or_none(id=sample_order.id)

    assert fetched is not None
    assert fetched.id == sample_order.id
    assert fetched.price == sample_order.price


async def test_update_order(db, sample_order, test_ids):
    """Test updating order."""
    user_id, artwork_id, collection_id = test_ids

    update_data = OrderAdd(
        user_id=user_id,
        artwork_id=artwork_id,
        collection_id=collection_id,
        price=5000,
    )

    await db.orders.edit(update_data, id=sample_order.id)
    await db.commit()

    updated = await db.orders.get_one_or_none(id=sample_order.id)

    assert updated.price == 5000


async def test_delete_order(db, sample_order):
    """Test deleting order."""
    order_id = sample_order.id

    # Delete
    await db.orders.delete(id=order_id)
    await db.commit()

    # Verify deleted
    deleted = await db.orders.get_one_or_none(id=order_id)
    assert deleted is None
