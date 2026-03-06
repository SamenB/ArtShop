import pytest
from pydantic import ValidationError
from src.schemas.orders import OrderAddRequest, EditionType

def test_order_add_request_valid():
    data = {"artwork_id": 1, "edition_type": "original"}
    order = OrderAddRequest(**data)
    assert order.artwork_id == 1
    assert order.edition_type == EditionType.ORIGINAL

def test_order_add_request_invalid_edition_type():
    data = {"artwork_id": 1, "edition_type": "fake_edition"}
    with pytest.raises(ValidationError) as exc:
        OrderAddRequest(**data)
    assert "Input should be 'original' or 'print'" in str(exc.value)

def test_order_add_request_missing_artwork_id():
    data = {"edition_type": "print"}
    with pytest.raises(ValidationError) as exc:
        OrderAddRequest(**data)
    assert "artwork_id" in str(exc.value)
