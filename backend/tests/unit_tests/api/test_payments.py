from types import SimpleNamespace

import pytest

from src.api.payments import _order_total_to_currency_coins, _validate_order_totals_for_payment
from src.exeptions import InvalidDataException


def test_order_total_to_currency_coins_uses_backend_uah_rate() -> None:
    assert _order_total_to_currency_coins(40, "UAH") == 158000


def test_order_total_to_currency_coins_supports_usd_without_conversion() -> None:
    assert _order_total_to_currency_coins(40, "USD") == 4000


def test_payment_guard_accepts_server_resolved_storefront_economics() -> None:
    order = SimpleNamespace(
        subtotal_price=18,
        shipping_price=22,
        discount_price=0,
        total_price=40,
        items=[
            SimpleNamespace(
                edition_type="canvas_print",
                price=40,
                customer_product_price=18,
                customer_shipping_price=22,
                customer_line_total=40,
                prodigi_storefront_bake_id=10,
                prodigi_storefront_policy_version="print_shipping_passthrough_v1",
            )
        ],
    )

    _validate_order_totals_for_payment(order)


def test_payment_guard_rejects_legacy_print_without_active_payload_link() -> None:
    order = SimpleNamespace(
        subtotal_price=18,
        shipping_price=9,
        discount_price=0,
        total_price=27,
        items=[
            SimpleNamespace(
                edition_type="canvas_print",
                price=27,
                customer_product_price=18,
                customer_shipping_price=9,
                customer_line_total=27,
                prodigi_storefront_bake_id=None,
                prodigi_storefront_policy_version=None,
            )
        ],
    )

    with pytest.raises(InvalidDataException) as exc:
        _validate_order_totals_for_payment(order)

    assert exc.value.status_code == 409


def test_payment_guard_rejects_order_total_mismatch() -> None:
    order = SimpleNamespace(
        subtotal_price=18,
        shipping_price=22,
        discount_price=0,
        total_price=27,
        items=[
            SimpleNamespace(
                edition_type="canvas_print",
                price=40,
                customer_product_price=18,
                customer_shipping_price=22,
                customer_line_total=40,
                prodigi_storefront_bake_id=10,
                prodigi_storefront_policy_version="print_shipping_passthrough_v1",
            )
        ],
    )

    with pytest.raises(InvalidDataException) as exc:
        _validate_order_totals_for_payment(order)

    assert exc.value.status_code == 409
