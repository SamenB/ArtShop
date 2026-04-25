from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.services.prodigi_orders import ProdigiOrderService


class _ScalarResult:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class _FakeProdigiClient:
    calls = []
    response = {"outcome": "Created", "order": {"id": "ord_test_123"}}

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        return None

    async def post(self, path, body):
        self.calls.append((path, body))
        return self.response


def _build_order_item(**overrides):
    defaults = {
        "id": 11,
        "artwork_id": 7,
        "edition_type": "canvas_print",
        "finish": "Stretched Canvas",
        "size": "40 x 50 cm",
        "prodigi_sku": "GLOBAL-CAN-16X20",
        "prodigi_category_id": "canvasStretched",
        "prodigi_slot_size_label": "40x50",
        "prodigi_attributes": {"wrap": "White"},
        "prodigi_shipping_method": "Standard",
        "prodigi_status": None,
        "prodigi_order_id": None,
    }
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def _build_order(item):
    return SimpleNamespace(
        id=101,
        first_name="Test",
        last_name="Buyer",
        shipping_address_line1="Street 1",
        shipping_address_line2=None,
        shipping_postal_code="01001",
        shipping_country_code="UA",
        shipping_city="Kyiv",
        shipping_state=None,
        shipping_phone=None,
        phone="+380000000000",
        email="buyer@example.com",
        items=[item],
    )


@pytest.mark.asyncio
async def test_submit_order_items_uses_prepared_asset_url(monkeypatch):
    _FakeProdigiClient.calls = []
    monkeypatch.setattr("src.services.prodigi_orders.ProdigiClient", _FakeProdigiClient)

    prepared_asset = SimpleNamespace(
        id=77,
        file_url="/static/print-prep/7/clean/derived/40x50.png",
    )
    db_session = SimpleNamespace(
        execute=AsyncMock(return_value=_ScalarResult(prepared_asset)),
        commit=AsyncMock(),
    )
    item = _build_order_item()
    order = _build_order(item)

    await ProdigiOrderService.submit_order_items(order, db_session)

    assert item.prodigi_status == "Submitted"
    assert item.prodigi_order_id == "ord_test_123"
    assert len(_FakeProdigiClient.calls) == 1
    path, body = _FakeProdigiClient.calls[0]
    assert path == "/orders"
    assert body["items"][0]["assets"][0]["url"] == (
        "http://localhost:8000/static/print-prep/7/clean/derived/40x50.png"
    )
    assert body["items"][0]["attributes"] == {"wrap": "White"}
    db_session.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_submit_order_items_blocks_when_prepared_asset_is_missing(monkeypatch):
    _FakeProdigiClient.calls = []
    monkeypatch.setattr("src.services.prodigi_orders.ProdigiClient", _FakeProdigiClient)

    db_session = SimpleNamespace(
        execute=AsyncMock(return_value=_ScalarResult(None)),
        commit=AsyncMock(),
    )
    item = _build_order_item()
    order = _build_order(item)

    await ProdigiOrderService.submit_order_items(order, db_session)

    assert item.prodigi_status == "Failed - Missing Prepared Asset"
    assert item.prodigi_order_id is None
    assert _FakeProdigiClient.calls == []
    db_session.commit.assert_awaited_once()


def test_resolve_category_id_falls_back_for_legacy_finish_labels():
    item = _build_order_item(
        prodigi_category_id=None,
        edition_type="canvas_print",
        finish="Floating Framed Canvas",
    )

    assert ProdigiOrderService._resolve_category_id(item) == "canvasFloatingFrame"
