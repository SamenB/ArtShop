import pytest

from src.utils.order_public_code import public_order_code, resolve_public_order_code


def test_public_order_code_hides_sequential_id() -> None:
    code = public_order_code(19)

    assert code.startswith("SB-")
    assert "19" not in code
    assert resolve_public_order_code(code) == 19


def test_resolve_public_order_code_accepts_legacy_numeric_id() -> None:
    assert resolve_public_order_code("19") == 19


def test_resolve_public_order_code_rejects_invalid_values() -> None:
    with pytest.raises(ValueError):
        resolve_public_order_code("not-an-order")
