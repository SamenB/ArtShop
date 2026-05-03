from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.exeptions import (
    InvalidDataException,
    OriginalSoldOutException,
    PrintsSoldOutException,
)
from src.schemas.artworks import ArtworkWithLabels
from src.schemas.orders import EditionType, OrderAddRequest
from src.services.orders import OrderService


# Mock DB Manager that OrderService will use
class MockDBManager:
    def __init__(self):
        self.artworks = AsyncMock()
        self.orders = AsyncMock()
        self.email_templates = AsyncMock()
        self.email_templates.get_by_key = AsyncMock(return_value=None)
        from src.models.orders import OrdersOrm

        self.orders.model = OrdersOrm
        self.order_items = AsyncMock()
        self.commit = AsyncMock()
        self.rollback = AsyncMock()
        self.session = MagicMock()
        self.session.execute = AsyncMock()
        self.session.get = AsyncMock(return_value=None)


@pytest.fixture
def order_service(monkeypatch):
    class FakeProdigiOrderRehydrationService:
        def __init__(self, db):
            self.db = db

        async def rehydrate_item(self, **kwargs):
            return None

        def apply_to_item_add(self, item_add, selection):
            return None

    monkeypatch.setattr(
        "src.services.orders.ProdigiOrderRehydrationService",
        FakeProdigiOrderRehydrationService,
    )
    service = OrderService(MockDBManager())
    return service


def test_print_provider_cost_check_blocks_underpaid_order(order_service):
    order = SimpleNamespace(
        total_price=18,
        items=[
            SimpleNamespace(prodigi_wholesale_eur=5.0, prodigi_shipping_eur=17.95),
        ],
    )

    assert order_service._print_provider_cost_is_covered(order) is False
    assert order_service._print_provider_cost_summary(order) == {
        "customer_paid": 18.0,
        "supplier_total": 22.95,
    }


def test_print_provider_cost_check_allows_covered_order(order_service):
    order = SimpleNamespace(
        total_price=30,
        items=[
            SimpleNamespace(prodigi_wholesale_eur=9.0, prodigi_shipping_eur=20.95),
        ],
    )

    assert order_service._print_provider_cost_is_covered(order) is True


def test_prodigi_destination_country_contract_allows_matching_country(order_service):
    item = SimpleNamespace(prodigi_destination_country_code="de")

    order_service._validate_prodigi_destination_country(item, "DE")


def test_prodigi_destination_country_contract_blocks_mismatch(order_service):
    item = SimpleNamespace(prodigi_destination_country_code="DE")

    with pytest.raises(InvalidDataException, match="priced for DE"):
        order_service._validate_prodigi_destination_country(item, "US")


def test_prodigi_destination_country_contract_requires_country(order_service):
    item = SimpleNamespace(prodigi_destination_country_code=None)

    with pytest.raises(InvalidDataException, match="missing the Prodigi destination country"):
        order_service._validate_prodigi_destination_country(item, "US")


@pytest.mark.asyncio
async def test_create_order_original_sold_out_fails(order_service):
    # Setup mock artwork that has original already sold
    mock_artwork = MagicMock(spec=ArtworkWithLabels)
    mock_artwork.id = 1
    mock_artwork.original_status = "sold"

    order_service.db.artworks.get_one.return_value = mock_artwork

    order_data = OrderAddRequest(
        first_name="T",
        last_name="U",
        email="e@e.com",
        phone="1234567",
        shipping_country="UA",
        shipping_country_code="UA",
        shipping_city="Kyiv",
        shipping_address_line1="St 1",
        shipping_postal_code="01001",
        items=[
            {"artwork_id": 1, "edition_type": EditionType.ORIGINAL, "finish": "none", "price": 1000}
        ],
    )

    with pytest.raises(OriginalSoldOutException):
        await order_service.create_order(order_data, user_id=1)


@pytest.mark.asyncio
async def test_create_order_print_sold_out_fails(order_service):
    # Setup mock artwork that has 0 prints available
    mock_artwork = MagicMock(spec=ArtworkWithLabels)
    mock_artwork.id = 1
    mock_artwork.has_paper_print = False

    order_service.db.artworks.get_one.return_value = mock_artwork

    order_data = OrderAddRequest(
        first_name="T",
        last_name="U",
        email="e@e.com",
        phone="1234567",
        shipping_country="UA",
        shipping_country_code="UA",
        shipping_city="Kyiv",
        shipping_address_line1="St 1",
        shipping_postal_code="01001",
        items=[
            {
                "artwork_id": 1,
                "edition_type": EditionType.PAPER_PRINT,
                "finish": "none",
                "price": 1000,
                "prodigi_category_id": "paperPrintRolled",
                "prodigi_slot_size_label": "40x50",
                "prodigi_destination_country_code": "UA",
            }
        ],
    )

    with pytest.raises(PrintsSoldOutException):
        await order_service.create_order(order_data, user_id=1)


@pytest.mark.asyncio
async def test_create_order_original_success(order_service):
    mock_artwork = MagicMock(spec=ArtworkWithLabels)
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
        phone="1234567",
        shipping_country="UA",
        shipping_country_code="UA",
        shipping_city="Kyiv",
        shipping_address_line1="St 1",
        shipping_postal_code="01001",
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
    mock_artwork = MagicMock(spec=ArtworkWithLabels)
    mock_artwork.id = 1
    mock_artwork.has_paper_print = True

    order_service.db.artworks.get_one.return_value = mock_artwork

    mock_created_order = MagicMock()
    mock_created_order.id = 101
    order_service.db.orders.add.return_value = mock_created_order
    order_service.db.orders.get_one.return_value = mock_created_order

    order_data = OrderAddRequest(
        first_name="T",
        last_name="U",
        email="e@e.com",
        phone="1234567",
        shipping_country="UA",
        shipping_country_code="UA",
        shipping_city="Kyiv",
        shipping_address_line1="St 1",
        shipping_postal_code="01001",
        items=[
            {
                "artwork_id": 1,
                "edition_type": EditionType.PAPER_PRINT,
                "finish": "none",
                "price": 1000,
                "prodigi_category_id": "paperPrintRolled",
                "prodigi_slot_size_label": "40x50",
                "prodigi_destination_country_code": "UA",
            }
        ],
    )

    result = await order_service.create_order(order_data, user_id=1)

    assert result.id == 101

    # Print purchase no longer edits artworks.
    order_service.db.artworks.edit.assert_not_called()

    order_item_args, _order_item_kwargs = order_service.db.order_items.add.await_args
    assert order_item_args[0].prodigi_category_id == "paperPrintRolled"
    assert order_item_args[0].prodigi_slot_size_label == "40x50"
    assert order_item_args[0].prodigi_destination_country_code == "UA"

    order_service.db.orders.add.assert_awaited_once()
    order_service.db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_update_payment_status_releases_artwork_on_failure(order_service):
    """
    If admin updates payment status to 'failed', the order fulfillment should cancel
    and original artworks should be released back to inventory.
    """
    mock_order = MagicMock()
    mock_order.id = 55
    mock_order.fulfillment_status = "pending"
    mock_item = MagicMock()
    mock_item.edition_type = "original"
    mock_item.artwork_id = 99
    mock_order.items = [mock_item]

    order_service.db.orders.get_one.return_value = mock_order

    await order_service.update_payment_status(55, "failed")

    # Assert db.orders.edit was called with payment_status=failed and fulfillment_status=cancelled
    order_service.db.orders.edit.assert_awaited_once()
    args, kwargs = order_service.db.orders.edit.call_args
    assert args[0].payment_status == "failed"
    assert args[0].fulfillment_status == "cancelled"

    # Assert _release_original_artworks was triggered, changing original_status -> available
    order_service.db.artworks.edit.assert_awaited_once()
    art_args, art_kwargs = order_service.db.artworks.edit.call_args
    assert art_args[0].original_status == "available"
    assert art_kwargs["id"] == 99


@pytest.mark.asyncio
async def test_update_payment_status_by_webhook_releases_artwork_on_refund(order_service):
    """
    If Monobank webhook sends 'refunded', it should release artwork.
    """
    mock_order = MagicMock()
    mock_order.id = 56
    mock_order.fulfillment_status = "shipped"  # Not cancelled yet
    mock_order.payment_status = "paid"

    mock_item = MagicMock()
    mock_item.edition_type = "original"
    mock_item.artwork_id = 100
    mock_order.items = [mock_item]

    order_service.db.orders.get_filtered.return_value = [mock_order]

    await order_service.update_payment_status_by_invoice("INV123", "refunded")

    order_service.db.artworks.edit.assert_awaited_once()
    art_args, art_kwargs = order_service.db.artworks.edit.call_args
    assert art_args[0].original_status == "available"


@pytest.mark.asyncio
async def test_update_fulfillment_status_releases_artwork_on_cancel(order_service):
    """
    If admin cancels an order's fulfillment, the original artwork must be returned to inventory.
    """
    mock_order = MagicMock()
    mock_order.id = 57
    mock_order.fulfillment_status = "pending"
    mock_item = MagicMock()
    mock_item.edition_type = "original"
    mock_item.artwork_id = 101
    mock_order.items = [mock_item]

    order_service.db.orders.get_one.return_value = mock_order

    from src.schemas.orders import FulfillmentStatus, FulfillmentStatusUpdate

    update_data = FulfillmentStatusUpdate(fulfillment_status=FulfillmentStatus.CANCELLED)

    await order_service.update_fulfillment_status(57, update_data)

    order_service.db.artworks.edit.assert_awaited_once()
    art_args, art_kwargs = order_service.db.artworks.edit.call_args
    assert art_args[0].original_status == "available"
    assert art_kwargs["id"] == 101


@pytest.mark.asyncio
async def test_run_abandoned_orders_cleanup(order_service):
    """
    Ensures that the automated scheduled task queries the DB for abandoned orders,
    cancels them, and releases their artworks.
    """
    mock_order_1 = MagicMock()
    mock_order_1.id = 80

    mock_item_1 = MagicMock()
    mock_item_1.edition_type = "original"
    mock_item_1.artwork_id = 200
    mock_order_1.items = [mock_item_1]

    # Mock DB response
    order_service.db.orders.get_abandoned_orders.return_value = [mock_order_1]

    processed_count = await order_service.run_abandoned_orders_cleanup(timeout_hours=2)

    assert processed_count == 1

    # Assert artwork was released
    order_service.db.artworks.edit.assert_awaited_once()
    art_args, art_kwargs = order_service.db.artworks.edit.call_args
    assert art_args[0].original_status == "available"
    assert art_kwargs["id"] == 200

    # Assert order was marked failed/cancelled
    order_service.db.orders.edit.assert_awaited_once()
    ord_args, ord_kwargs = order_service.db.orders.edit.call_args
    assert ord_args[0].payment_status == "failed"
    assert ord_args[0].fulfillment_status == "cancelled"
