from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.integrations.prodigi.services.prodigi_fulfillment_quality import (
    FulfillmentGateResult,
    PreparedProdigiItem,
)
from src.integrations.prodigi.services.prodigi_orders import ProdigiOrderService


class _ScalarResult:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class _FakeProdigiClient:
    calls = []
    response = {"outcome": "Created", "order": {"id": "ord_test_123"}}

    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        return None

    async def post(self, path, body):
        self.calls.append((path, body))
        return self.response


class _FakeOrderAssetService:
    prepared_asset = {
        "file_url": "/static/print-prep/7/clean/derived/40x50.png",
        "print_area_name": "default",
    }

    def __init__(self, db_session):
        self.db_session = db_session

    async def prepare_order_asset(self, **kwargs):
        return self.prepared_asset


class _FakeQualityService:
    prepared_asset = {
        "file_url": "/static/print-prep/7/clean/derived/40x50.png",
        "print_area_name": "default",
    }

    def __init__(self, db_session):
        self.db_session = db_session

    async def prepare_item(self, *, order, item, job_id=None):
        if self.prepared_asset is None:
            return None
        asset_url = ProdigiOrderService._public_asset_url(self.prepared_asset["file_url"])
        return PreparedProdigiItem(
            item=item,
            category_id=item.prodigi_category_id,
            asset_url=asset_url,
            rendered=self.prepared_asset,
            target={"width_px": 420, "height_px": 520},
            gates=[FulfillmentGateResult("test_gate", "passed")],
        )

    def add_event(self, **kwargs):
        return None

    def build_gate_summary(self, prepared_items):
        return {"item_count": len(prepared_items)}


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
    monkeypatch.setattr(
        "src.integrations.prodigi.services.prodigi_orders.ProdigiClient", _FakeProdigiClient
    )
    _FakeQualityService.prepared_asset = {
        "file_url": "/static/print-prep/7/clean/derived/40x50.png",
        "print_area_name": "default",
    }
    monkeypatch.setattr(
        "src.integrations.prodigi.services.prodigi_orders.ProdigiFulfillmentQualityService",
        _FakeQualityService,
    )

    db_session = SimpleNamespace(
        execute=AsyncMock(return_value=_ScalarResult(None)),
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
    assert body["items"][0]["assets"][0]["printArea"] == "default"
    assert body["items"][0]["attributes"] == {"wrap": "White"}
    db_session.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_submit_order_items_uses_resolved_print_area_name(monkeypatch):
    _FakeProdigiClient.calls = []
    monkeypatch.setattr(
        "src.integrations.prodigi.services.prodigi_orders.ProdigiClient", _FakeProdigiClient
    )
    _FakeQualityService.prepared_asset = {
        "file_url": "/static/print-prep/7/clean/derived/40x50.png",
        "print_area_name": "one",
    }
    monkeypatch.setattr(
        "src.integrations.prodigi.services.prodigi_orders.ProdigiFulfillmentQualityService",
        _FakeQualityService,
    )

    db_session = SimpleNamespace(
        execute=AsyncMock(return_value=_ScalarResult(None)),
        commit=AsyncMock(),
    )
    item = _build_order_item()
    order = _build_order(item)

    await ProdigiOrderService.submit_order_items(order, db_session)

    _path, body = _FakeProdigiClient.calls[0]
    assert body["items"][0]["assets"][0]["printArea"] == "one"


@pytest.mark.asyncio
async def test_submit_order_items_blocks_when_prepared_asset_is_missing(monkeypatch):
    _FakeProdigiClient.calls = []
    monkeypatch.setattr(
        "src.integrations.prodigi.services.prodigi_orders.ProdigiClient", _FakeProdigiClient
    )
    _FakeQualityService.prepared_asset = None
    monkeypatch.setattr(
        "src.integrations.prodigi.services.prodigi_orders.ProdigiFulfillmentQualityService",
        _FakeQualityService,
    )

    db_session = SimpleNamespace(
        execute=AsyncMock(return_value=_ScalarResult(None)),
        commit=AsyncMock(),
    )
    item = _build_order_item()
    order = _build_order(item)

    await ProdigiOrderService.submit_order_items(order, db_session)

    assert item.prodigi_status == "Failed - Quality Gate"
    assert item.prodigi_order_id is None
    assert _FakeProdigiClient.calls == []
    db_session.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_submit_order_items_batches_multiple_prints_in_one_prodigi_request(monkeypatch):
    _FakeProdigiClient.calls = []
    monkeypatch.setattr(
        "src.integrations.prodigi.services.prodigi_orders.ProdigiClient", _FakeProdigiClient
    )
    _FakeQualityService.prepared_asset = {
        "file_url": "/static/print-prep/7/clean/derived/40x50.png",
        "print_area_name": "default",
    }
    monkeypatch.setattr(
        "src.integrations.prodigi.services.prodigi_orders.ProdigiFulfillmentQualityService",
        _FakeQualityService,
    )

    db_session = SimpleNamespace(
        execute=AsyncMock(return_value=_ScalarResult(None)),
        commit=AsyncMock(),
    )
    first = _build_order_item(id=11, prodigi_sku="GLOBAL-CAN-16X20")
    second = _build_order_item(id=12, prodigi_sku="GLOBAL-CAN-20X24")
    order = _build_order(first)
    order.items = [first, second]

    await ProdigiOrderService.submit_order_items(order, db_session)

    assert len(_FakeProdigiClient.calls) == 1
    _path, body = _FakeProdigiClient.calls[0]
    assert body["idempotencyKey"] == "artshop-order-101-fulfillment-v1"
    assert body["merchantReference"] == "artshop-order-101"
    assert [item["sku"] for item in body["items"]] == ["GLOBAL-CAN-16X20", "GLOBAL-CAN-20X24"]
    assert first.prodigi_order_id == "ord_test_123"
    assert second.prodigi_order_id == "ord_test_123"


def test_resolve_category_id_falls_back_for_legacy_finish_labels():
    item = _build_order_item(
        prodigi_category_id=None,
        edition_type="canvas_print",
        finish="Floating Framed Canvas",
    )

    assert ProdigiOrderService._resolve_category_id(item) == "canvasFloatingFrame"
