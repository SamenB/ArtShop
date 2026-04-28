from __future__ import annotations

from typing import Any

PRODIGI_ATTRIBUTE_ALIASES = {
    "mount_color": "mountColor",
    "paper_type": "paperType",
    "substrate_weight": "substrateWeight",
}


def normalize_prodigi_attributes(attributes: dict[str, Any] | None) -> dict[str, Any]:
    """Return API-safe Prodigi attributes without internal snake_case aliases."""
    if not isinstance(attributes, dict):
        return {}

    normalized: dict[str, Any] = {}
    for key, value in attributes.items():
        if value in (None, ""):
            continue
        normalized_key = PRODIGI_ATTRIBUTE_ALIASES.get(key, key)
        normalized[normalized_key] = value
    return normalized
