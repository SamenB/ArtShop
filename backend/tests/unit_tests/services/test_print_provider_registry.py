from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.print_on_demand.providers.prodigi import ProdigiPrintProvider
from src.print_on_demand.registry import get_print_provider
from src.services.artworks import ArtworkService
from src.services.orders import OrderService


class FakeArtworkProvider:
    def __init__(self):
        self.build_shop_summaries = AsyncMock(
            return_value={
                1: {
                    "country_code": "DE",
                    "print_country_supported": True,
                    "min_print_price": 123.45,
                    "mediums": {
                        "paper": {
                            "available": True,
                            "starting_price": 123.45,
                            "starting_size_label": "30 x 40 cm",
                            "card_count": 1,
                            "cards": [],
                        },
                        "canvas": {
                            "available": False,
                            "starting_price": None,
                            "starting_size_label": None,
                            "card_count": 0,
                            "cards": [],
                        },
                    },
                }
            }
        )

    async def rematerialize_artworks(self, **kwargs):
        return None


class FakeOrderProvider:
    def __init__(self):
        self.submit_paid_order_items = AsyncMock()


class MockArtworkDBManager:
    def __init__(self):
        self.artworks = AsyncMock()
        self.artwork_labels = AsyncMock()
        self.commit = AsyncMock()
        self.rollback = AsyncMock()


class MockOrderDBManager:
    def __init__(self):
        self.artworks = AsyncMock()
        self.orders = AsyncMock()
        self.email_templates = AsyncMock()
        self.email_templates.get_by_key = AsyncMock(return_value=None)
        self.commit = AsyncMock()
        self.rollback = AsyncMock()
        self.session = SimpleNamespace()


def test_get_print_provider_defaults_to_prodigi():
    get_print_provider.cache_clear()
    provider = get_print_provider()
    assert isinstance(provider, ProdigiPrintProvider)
    assert provider.provider_key == "prodigi"


@pytest.mark.asyncio
async def test_artwork_service_uses_active_print_provider_for_country_summaries(monkeypatch):
    fake_provider = FakeArtworkProvider()
    monkeypatch.setattr("src.services.artworks.get_print_provider", lambda: fake_provider)

    db = MockArtworkDBManager()
    artwork = SimpleNamespace(
        id=1,
        model_dump=lambda **kwargs: {"id": 1, "title": "Split"},
    )
    db.artworks.get_available_artworks.return_value = [artwork]

    result = await ArtworkService(db).get_all_artworks(country_code="DE")

    fake_provider.build_shop_summaries.assert_awaited_once()
    assert result[0]["storefront_summary"]["min_print_price"] == 123.45
    assert result[0]["has_prints"] is True
    assert result[0]["base_print_price"] == 123.45


@pytest.mark.asyncio
async def test_order_service_uses_active_print_provider_for_paid_submission(monkeypatch):
    fake_provider = FakeOrderProvider()
    monkeypatch.setattr("src.services.orders.get_print_provider", lambda: fake_provider)

    db = MockOrderDBManager()
    order = SimpleNamespace(
        id=77,
        payment_status="processing",
        fulfillment_status="pending",
        first_name="Test",
        email="test@example.com",
        items=[],
    )
    db.orders.get_filtered.return_value = [order]

    await OrderService(db).update_payment_status_by_invoice("INV-77", "paid")

    fake_provider.submit_paid_order_items.assert_awaited_once_with(
        order=order,
        db_session=db.session,
    )
