from __future__ import annotations

import re

_ORDER_CODE_PREFIX = "SB"
_ORDER_CODE_MASK = 0x5F3759DF
_ORDER_CODE_OFFSET = 0x1A2B3C
_BASE36_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"


def public_order_code(order_id: int) -> str:
    encoded = int(order_id) ^ _ORDER_CODE_MASK
    encoded += _ORDER_CODE_OFFSET
    return f"{_ORDER_CODE_PREFIX}-{_to_base36(encoded)}"


def resolve_public_order_code(value: str | int) -> int:
    raw = str(value).strip()
    if raw.isdigit():
        return int(raw)

    normalized = raw.upper().replace("_", "-")
    match = re.fullmatch(rf"{_ORDER_CODE_PREFIX}-?([0-9A-Z]+)", normalized)
    if not match:
        raise ValueError("Invalid order reference")

    decoded = _from_base36(match.group(1)) - _ORDER_CODE_OFFSET
    order_id = decoded ^ _ORDER_CODE_MASK
    if order_id <= 0:
        raise ValueError("Invalid order reference")
    return order_id


def _to_base36(value: int) -> str:
    if value < 0:
        raise ValueError("Cannot encode a negative number")
    if value == 0:
        return "0"
    digits: list[str] = []
    while value:
        value, remainder = divmod(value, 36)
        digits.append(_BASE36_ALPHABET[remainder])
    return "".join(reversed(digits))


def _from_base36(value: str) -> int:
    result = 0
    for char in value:
        result = result * 36 + _BASE36_ALPHABET.index(char)
    return result
