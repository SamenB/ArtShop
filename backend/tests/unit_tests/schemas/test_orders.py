import pytest
from pydantic import ValidationError

from src.schemas.orders import EditionType, OrderAddRequest, OrderItemBase


def test_order_item_valid():
    data = {"artwork_id": 1, "edition_type": "original", "finish": "none", "price": 1000}
    item = OrderItemBase(**data)
    assert item.artwork_id == 1
    assert item.edition_type == EditionType.ORIGINAL


def test_order_item_invalid_edition_type():
    data = {"artwork_id": 1, "edition_type": "fake_edition", "finish": "none", "price": 1000}
    with pytest.raises(ValidationError) as exc:
        OrderItemBase(**data)
    message = str(exc.value)
    assert "canvas_print" in message
    assert "paper_print" in message


def test_order_add_request_valid():
    data = {
        "first_name": "Test",
        "last_name": "Test",
        "email": "test@test.com",
        "phone": "5551234",
        "shipping_country": "Ukraine",
        "shipping_country_code": "UA",
        "shipping_city": "Kyiv",
        "shipping_address_line1": "Test St 1",
        "shipping_postal_code": "01001",
        "items": [{"artwork_id": 1, "edition_type": "original", "finish": "none", "price": 1000}],
    }
    order = OrderAddRequest(**data)
    assert order.first_name == "Test"
    assert len(order.items) == 1
