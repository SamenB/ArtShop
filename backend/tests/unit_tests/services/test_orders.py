from unittest.mock import AsyncMock, MagicMock

import pytest

from src.exeptions import (
    OriginalSoldOutException,
    PrintsSoldOutException,
)
from src.schemas.artworks import ArtworkWithTags
from src.schemas.orders import EditionType, OrderAddRequest
from src.services.orders import OrderService


# Mock DB Manager that OrderService will use
class MockDBManager:
    def __init__(self):
        self.artworks = AsyncMock()
        self.orders = AsyncMock()
        self.order_items = AsyncMock()
        self.commit = AsyncMock()
        self.rollback = AsyncMock()


@pytest.fixture
def order_service():
    service = OrderService(MockDBManager())
    return service





@pytest.mark.asyncio
async def test_create_order_original_sold_out_fails(order_service):
    # Setup mock artwork that has original already sold
    mock_artwork = MagicMock(spec=ArtworkWithTags)
    mock_artwork.id = 1
    mock_artwork.original_status = "sold"

    order_service.db.artworks.get_one.return_value = mock_artwork

    order_data = OrderAddRequest(
        first_name="T",
        last_name="U",
        email="e@e.com",
        phone="123",
        items=[
            {"artwork_id": 1, "edition_type": EditionType.ORIGINAL, "finish": "none", "price": 1000}
        ],
    )

    with pytest.raises(OriginalSoldOutException):
        await order_service.create_order(order_data, user_id=1)


@pytest.mark.asyncio
async def test_create_order_print_sold_out_fails(order_service):
    # Setup mock artwork that has 0 prints available
    mock_artwork = MagicMock(spec=ArtworkWithTags)
    mock_artwork.id = 1
    mock_artwork.has_prints = False

    order_service.db.artworks.get_one.return_value = mock_artwork

    order_data = OrderAddRequest(
        first_name="T",
        last_name="U",
        email="e@e.com",
        phone="123",
        items=[
            {"artwork_id": 1, "edition_type": EditionType.PRINT, "finish": "none", "price": 1000}
        ],
    )

    with pytest.raises(PrintsSoldOutException):
        await order_service.create_order(order_data, user_id=1)


@pytest.mark.asyncio
async def test_create_order_original_success(order_service):
    mock_artwork = MagicMock(spec=ArtworkWithTags)
    mock_artwork.id = 1
    mock_artwork.original_status = "available"
    mock_artwork.original_price = 1000

    order_service.db.artworks.get_one.return_value = mock_artwork

    mock_created_order = MagicMock()
    mock_created_order.id = 100
    order_service.db.orders.add.return_value = mock_created_order
    order_service.db.orders.get_one.return_value = mock_created_order

    order_data = OrderAddRequest(
        first_name="T",
        last_name="U",
        email="e@e.com",
        phone="123",
        items=[
            {"artwork_id": 1, "edition_type": EditionType.ORIGINAL, "finish": "none", "price": 1000}
        ],
    )

    result = await order_service.create_order(order_data, user_id=1)

    assert result.id == 100

    # Assert edit was called with original_status="sold"
    order_service.db.artworks.edit.assert_awaited_once()
    args, kwargs = order_service.db.artworks.edit.call_args
    assert args[0].original_status == "sold"
    assert kwargs.get("id") == 1

    order_service.db.orders.add.assert_awaited_once()
    order_service.db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_create_order_print_success(order_service):
    mock_artwork = MagicMock(spec=ArtworkWithTags)
    mock_artwork.id = 1
    mock_artwork.has_prints = True
    mock_artwork.base_print_price = 50

    order_service.db.artworks.get_one.return_value = mock_artwork

    mock_created_order = MagicMock()
    mock_created_order.id = 101
    order_service.db.orders.add.return_value = mock_created_order
    order_service.db.orders.get_one.return_value = mock_created_order

    order_data = OrderAddRequest(
        first_name="T",
        last_name="U",
        email="e@e.com",
        phone="123",
        items=[
            {"artwork_id": 1, "edition_type": EditionType.PRINT, "finish": "none", "price": 1000}
        ],
    )

    result = await order_service.create_order(order_data, user_id=1)

    assert result.id == 101

    # Print purchase no longer edits artworks.
    order_service.db.artworks.edit.assert_not_called()

    order_service.db.orders.add.assert_awaited_once()
    order_service.db.commit.assert_awaited_once()
