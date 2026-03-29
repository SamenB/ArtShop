import pytest

from src.models.orders import OrderItemOrm, OrdersOrm
from src.schemas.orders import OrderAdd

# ============ FIXTURES ============


@pytest.fixture(scope="function")
async def test_ids(db):
    """Fixture: returns (user_id, artwork_id) for tests."""
    user_id = (await db.users.get_all())[0].id
    artwork_id = (await db.artworks.get_all())[0].id
    return user_id, artwork_id


@pytest.fixture(scope="function")
async def sample_order(db, test_ids):
    """Fixture: creates and returns an order for tests that need existing data."""
    user_id, artwork_id = test_ids

    # Using ORM for direct relationship insertion in tests
    order_orm = OrdersOrm(
        user_id=user_id,
        first_name="Test",
        last_name="User",
        email="test@user.com",
        phone="12345678",
        total_price=2000,
    )
    item_orm = OrderItemOrm(
        artwork_id=artwork_id, edition_type="original", finish="none", price=2000
    )
    order_orm.items = [item_orm]
    db.session.add(order_orm)
    await db.commit()
    return order_orm


# ============ TESTS ============


async def test_create_order(db, test_ids):
    """Test order creation using repository (only main order record)."""
    user_id, _ = test_ids

    order_data = OrderAdd(
        user_id=user_id,
        first_name="New",
        last_name="Order",
        email="new@order.com",
        phone="123456",
        total_price=1500,
        items=[],  # relationships handled separately
    )

    result = await db.orders.add(order_data)
    await db.commit()

    assert result.id is not None
    assert result.user_id == user_id
    assert result.total_price == 1500


async def test_read_order(db, sample_order):
    """Test reading order by ID."""
    fetched = await db.orders.get_one_or_none(id=sample_order.id)

    assert fetched is not None
    assert fetched.id == sample_order.id
    assert fetched.total_price == sample_order.total_price


async def test_update_order(db, sample_order, test_ids):
    """Test updating order."""
    user_id, artwork_id = test_ids

    update_data = OrderAdd(
        user_id=user_id,
        first_name="Updated",
        last_name="Name",
        email="test@user.com",
        phone="12345678",
        total_price=5000,
        items=[],
    )

    await db.orders.edit(update_data, id=sample_order.id)
    await db.commit()

    updated = await db.orders.get_one_or_none(id=sample_order.id)

    assert updated.total_price == 5000
    assert updated.first_name == "Updated"


async def test_delete_order(db, sample_order):
    """Test deleting order. Requires deleting items first due to foreign keys."""
    order_id = sample_order.id

    # Delete
    await db.order_items.delete(order_id=order_id)
    await db.orders.delete(id=order_id)
    await db.commit()

    # Verify deleted
    deleted = await db.orders.get_one_or_none(id=order_id)
    assert deleted is None
