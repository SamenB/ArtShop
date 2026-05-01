from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.config import settings
from src.integrations.prodigi.fulfillment.workflow import ProdigiFulfillmentWorkflow
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
    order_response = None

    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        return None

    async def post(self, path, body):
        self.calls.append((path, body))
        return self.response

    async def get_order(self, order_id):
        return self.order_response


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
    persisted_order_gates = []

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

    async def persist_order_gate(self, **kwargs):
        self.persisted_order_gates.append(kwargs.get("gate"))
        return None


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
        "prodigi_order_item_id": None,
        "prodigi_asset_id": None,
        "prodigi_supplier_total_eur": 12.0,
        "prodigi_wholesale_eur": 8.0,
        "prodigi_shipping_eur": 4.0,
        "customer_line_total": 40.0,
        "customer_currency": "USD",
    }
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def _build_order(item):
    return SimpleNamespace(
        id=101,
        payment_status="paid",
        total_price=40.0,
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
        fulfillment_status="confirmed",
        print_ordered_at=None,
        items=[item],
    )


@pytest.mark.asyncio
async def test_preflight_builds_payload_preview_without_submitting(monkeypatch):
    monkeypatch.setattr(settings, "PUBLIC_BASE_URL", "https://example.test")
    _FakeProdigiClient.calls = []
    _FakeQualityService.prepared_asset = {
        "file_url": "/static/print-prep/7/clean/derived/40x50.png",
        "print_area_name": "default",
    }
    monkeypatch.setattr(
        "src.integrations.prodigi.fulfillment.workflow.ProdigiFulfillmentQualityService",
        _FakeQualityService,
    )

    item = _build_order_item()
    order = _build_order(item)
    result = await ProdigiFulfillmentWorkflow(SimpleNamespace()).run_preflight(
        order,
        commit=False,
    )

    assert result.passed is True
    assert result.request_payload["merchantReference"] == "artshop-order-101"
    assert result.request_payload["items"][0]["merchantReference"] == "artshop-order-101-item-11"
    assert result.request_payload["items"][0]["assets"][0]["url"].startswith(
        "https://example.test/"
    )
    assert _FakeProdigiClient.calls == []


@pytest.mark.asyncio
async def test_submit_order_items_uses_prepared_asset_url(monkeypatch):
    monkeypatch.setattr(settings, "PUBLIC_BASE_URL", "https://example.test")
    _FakeProdigiClient.calls = []
    _FakeProdigiClient.order_response = None
    monkeypatch.setattr(
        "src.integrations.prodigi.fulfillment.workflow.ProdigiClient", _FakeProdigiClient
    )
    _FakeQualityService.prepared_asset = {
        "file_url": "/static/print-prep/7/clean/derived/40x50.png",
        "print_area_name": "default",
    }
    monkeypatch.setattr(
        "src.integrations.prodigi.fulfillment.workflow.ProdigiFulfillmentQualityService",
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
    assert order.fulfillment_status == "print_ordered"
    assert order.print_ordered_at is not None
    assert len(_FakeProdigiClient.calls) == 1
    path, body = _FakeProdigiClient.calls[0]
    assert path == "/orders"
    assert body["items"][0]["assets"][0]["url"] == (
        "https://example.test/static/print-prep/7/clean/derived/40x50.png"
    )
    assert body["items"][0]["assets"][0]["printArea"] == "default"
    assert body["items"][0]["attributes"] == {"wrap": "White"}
    db_session.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_submit_order_items_uses_resolved_print_area_name(monkeypatch):
    _FakeProdigiClient.calls = []
    _FakeProdigiClient.order_response = None
    monkeypatch.setattr(
        "src.integrations.prodigi.fulfillment.workflow.ProdigiClient", _FakeProdigiClient
    )
    _FakeQualityService.prepared_asset = {
        "file_url": "/static/print-prep/7/clean/derived/40x50.png",
        "print_area_name": "one",
    }
    monkeypatch.setattr(
        "src.integrations.prodigi.fulfillment.workflow.ProdigiFulfillmentQualityService",
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
    _FakeProdigiClient.order_response = None
    monkeypatch.setattr(
        "src.integrations.prodigi.fulfillment.workflow.ProdigiClient", _FakeProdigiClient
    )
    _FakeQualityService.prepared_asset = None
    monkeypatch.setattr(
        "src.integrations.prodigi.fulfillment.workflow.ProdigiFulfillmentQualityService",
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
async def test_preflight_marks_payload_blocked_when_upstream_gates_fail(monkeypatch):
    _FakeQualityService.prepared_asset = None
    _FakeQualityService.persisted_order_gates = []
    monkeypatch.setattr(
        "src.integrations.prodigi.fulfillment.workflow.ProdigiFulfillmentQualityService",
        _FakeQualityService,
    )

    db_session = SimpleNamespace(
        execute=AsyncMock(return_value=_ScalarResult(None)),
        commit=AsyncMock(),
    )
    item = _build_order_item()
    order = _build_order(item)

    result = await ProdigiFulfillmentWorkflow(db_session).run_preflight(order)

    payload_gates = [
        gate for gate in _FakeQualityService.persisted_order_gates if gate.gate == "payload_valid"
    ]
    assert result.passed is False
    assert payload_gates
    assert payload_gates[-1].status == "blocked"
    assert "upstream" in payload_gates[-1].error


@pytest.mark.asyncio
async def test_submit_order_items_batches_multiple_prints_in_one_prodigi_request(monkeypatch):
    _FakeProdigiClient.calls = []
    _FakeProdigiClient.order_response = None
    monkeypatch.setattr(
        "src.integrations.prodigi.fulfillment.workflow.ProdigiClient", _FakeProdigiClient
    )
    _FakeQualityService.prepared_asset = {
        "file_url": "/static/print-prep/7/clean/derived/40x50.png",
        "print_area_name": "default",
    }
    monkeypatch.setattr(
        "src.integrations.prodigi.fulfillment.workflow.ProdigiFulfillmentQualityService",
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


@pytest.mark.asyncio
async def test_submit_ready_order_does_not_create_duplicate_when_already_submitted(monkeypatch):
    _FakeProdigiClient.calls = []
    _FakeProdigiClient.order_response = {
        "order": {
            "id": "ord_test_123",
            "status": {"stage": "InProgress", "issues": []},
            "items": [
                {
                    "id": "remote-item-11",
                    "merchantReference": "artshop-order-101-item-11",
                    "status": "InProgress",
                    "assets": [{"id": "remote-asset-1"}],
                }
            ],
        }
    }
    monkeypatch.setattr(
        "src.integrations.prodigi.fulfillment.workflow.ProdigiClient", _FakeProdigiClient
    )
    monkeypatch.setattr(
        "src.integrations.prodigi.fulfillment.workflow.ProdigiFulfillmentQualityService",
        _FakeQualityService,
    )

    existing_job = SimpleNamespace(
        id=5,
        order_id=101,
        status="submitted",
        prodigi_order_id="ord_test_123",
        latest_status_payload=None,
        response_payload=None,
        trace_parent=None,
        status_stage=None,
        status_details=None,
        issues=None,
        submitted_at=None,
        last_error=None,
    )
    db_session = SimpleNamespace(
        execute=AsyncMock(return_value=_ScalarResult(existing_job)),
        commit=AsyncMock(),
    )
    item = _build_order_item()
    order = _build_order(item)

    await ProdigiFulfillmentWorkflow(db_session).submit_ready_order(order)

    assert _FakeProdigiClient.calls == []
    assert existing_job.status == "in_progress"
    assert existing_job.status_stage == "InProgress"
    assert item.prodigi_order_item_id == "remote-item-11"
    assert item.prodigi_asset_id == "remote-asset-1"


def test_resolve_category_id_falls_back_for_legacy_finish_labels():
    item = _build_order_item(
        prodigi_category_id=None,
        edition_type="canvas_print",
        finish="Floating Framed Canvas",
    )

    assert ProdigiOrderService._resolve_category_id(item) == "canvasFloatingFrame"


def test_build_order_payload_uses_selected_public_checkout_shipping_method():
    item = _build_order_item(prodigi_shipping_method="Budget")
    order = _build_order(item)

    body = ProdigiOrderService.build_order_payload(
        order=order,
        item=item,
        asset_url="https://example.test/asset.png",
    )

    assert body["shippingMethod"] == "Budget"

    item.prodigi_shipping_method = "Express"
    body = ProdigiOrderService.build_order_payload(
        order=order,
        item=item,
        asset_url="https://example.test/asset.png",
    )

    assert body["shippingMethod"] == "Express"

    item.prodigi_shipping_method = "Overnight"
    body = ProdigiOrderService.build_order_payload(
        order=order,
        item=item,
        asset_url="https://example.test/asset.png",
    )

    assert body["shippingMethod"] == "Overnight"


@pytest.mark.parametrize(
    "category_id",
    [
        "paperPrintRolled",
        "paperPrintClassicFramed",
        "paperPrintBoxFramed",
        "canvasRolled",
        "canvasStretched",
        "canvasClassicFrame",
        "canvasFloatingFrame",
    ],
)
def test_batch_payload_contract_supports_active_print_families(category_id):
    item = _build_order_item(
        prodigi_category_id=category_id,
        prodigi_attributes={"wrap": "MirrorWrap"} if category_id.startswith("canvas") else {},
    )
    item.customer_line_total = 44.25
    item.customer_currency = "USD"
    item.prodigi_storefront_bake_id = 9
    item.prodigi_storefront_policy_version = "print_shipping_passthrough_v1"
    order = _build_order(item)
    order.checkout_group_id = "checkout-test"
    prepared = SimpleNamespace(
        item=item,
        asset_url="https://assets.example.test/print.png",
        rendered={"print_area_name": "default", "md5_hash": "a" * 32},
    )

    body = ProdigiOrderService.build_batch_order_payload(
        order=order,
        prepared_items=[prepared],
        merchant_reference="artshop-order-101",
        idempotency_key="artshop-order-101-fulfillment-v1",
        callback_url="https://shop.example.test/api/v1/webhooks/prodigi",
    )

    assert body["items"][0]["merchantReference"] == "artshop-order-101-item-11"
    assert body["items"][0]["sku"] == item.prodigi_sku
    assert body["items"][0]["sizing"] == "fillPrintArea"
    assert body["items"][0]["recipientCost"] == {"amount": "44.25", "currency": "USD"}
    assert body["items"][0]["assets"][0]["md5Hash"] == "a" * 32
    assert body["metadata"]["storefrontBakeId"] == 9
    assert body["metadata"]["storefrontPolicyVersion"] == "print_shipping_passthrough_v1"
    assert body["metadata"]["payloadHash"]
