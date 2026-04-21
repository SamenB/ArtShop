from __future__ import annotations

from collections import defaultdict
from typing import Any

STOREFRONT_POLICY: dict[str, dict[str, Any]] = {
    "paperPrintRolled": {
        "label": "Paper Print Unframed",
        "fixed_attributes": {},
        "allowed_attributes": {},
        "recommended_defaults": {},
        "shipping": {
            "visible_methods": ["Express", "Standard", "Budget"],
            "preferred_order": ["Express", "Standard", "Budget"],
            "default_method": "Express",
        },
        "notes": [
            "Unframed paper stays operationally simple and keeps the full size grid.",
            "Glass-like choices do not apply here.",
        ],
    },
    "paperPrintBoxFramed": {
        "label": "Paper Print Box Framed",
        "fixed_attributes": {
            "glaze": "Acrylic / Perspex",
        },
        "allowed_attributes": {
            "color": ["black", "white", "natural", "brown"],
        },
        "recommended_defaults": {
            "mount": "No mount / Mat",
        },
        "shipping": {
            "visible_methods": ["Express", "Standard"],
            "preferred_order": ["Express", "Standard"],
            "default_method": "Express",
        },
        "notes": [
            "Float glass is intentionally removed from storefront policy.",
            "Mount stays configurable for the later artwork-specific presentation layer.",
        ],
    },
    "canvasRolled": {
        "label": "Canvas Rolled",
        "fixed_attributes": {},
        "allowed_attributes": {},
        "recommended_defaults": {},
        "shipping": {
            "visible_methods": ["Express", "Standard", "Budget"],
            "preferred_order": ["Express", "Standard", "Budget"],
            "default_method": "Express",
        },
        "notes": [
            "Rolled canvas stays flexible because there are no visible frame or glazing decisions.",
        ],
    },
    "canvasStretched": {
        "label": "Canvas Stretched",
        "fixed_attributes": {},
        "allowed_attributes": {},
        "recommended_defaults": {
            "wrap": "MirrorWrap",
        },
        "shipping": {
            "visible_methods": ["Express", "Standard"],
            "preferred_order": ["Express", "Standard"],
            "default_method": "Express",
        },
        "notes": [
            "MirrorWrap is only a recommended default for the future artwork-specific setup stage.",
            "19mm and metallic canvas were already removed upstream.",
        ],
    },
    "canvasClassicFrame": {
        "label": "Canvas Classic Frame",
        "fixed_attributes": {},
        "allowed_attributes": {
            "color": ["black", "white", "brown"],
        },
        "recommended_defaults": {},
        "shipping": {
            "visible_methods": ["Express", "Standard"],
            "preferred_order": ["Express", "Standard"],
            "default_method": "Express",
        },
        "notes": [
            "Classic frame is kept separate from stretched canvas.",
            "Secondary colors are hidden because their geographic coverage is weaker.",
        ],
    },
    "canvasFloatingFrame": {
        "label": "Canvas Floating Frame",
        "fixed_attributes": {},
        "allowed_attributes": {
            "color": ["black", "white", "natural", "brown", "gold", "silver"],
        },
        "recommended_defaults": {},
        "shipping": {
            "visible_methods": ["Express", "Standard"],
            "preferred_order": ["Express", "Standard"],
            "default_method": "Express",
        },
        "notes": [
            "All six floating-frame colors stay visible because coverage is consistently strong.",
        ],
    },
}


class ProdigiStorefrontPolicyService:
    """
    Business rules that transform raw curated supplier rows into storefront-safe rows.

    This layer is intentionally separate from SQL access and preview rendering:
    - repository: reads supplier rows,
    - policy service: decides what the storefront is allowed to sell,
    - preview service: visualizes the result.
    """

    def get_policy_map(self) -> dict[str, dict[str, Any]]:
        return STOREFRONT_POLICY

    def apply(self, rows: list[dict[str, Any]]) -> dict[str, Any]:
        kept_rows: list[dict[str, Any]] = []
        removed_by_category: dict[str, int] = defaultdict(int)
        kept_by_category: dict[str, int] = defaultdict(int)

        for row in rows:
            category_id = row.get("category_id")
            if not category_id:
                continue

            if self._matches_policy(category_id, row):
                kept_rows.append(row)
                kept_by_category[category_id] += 1
            else:
                removed_by_category[category_id] += 1

        return {
            "rows": kept_rows,
            "policy_summary": self.build_policy_summary(
                kept_by_category=dict(kept_by_category),
                removed_by_category=dict(removed_by_category),
            ),
            "removed_route_count": sum(removed_by_category.values()),
        }

    def build_policy_summary(
        self,
        kept_by_category: dict[str, int],
        removed_by_category: dict[str, int],
    ) -> dict[str, dict[str, Any]]:
        summary: dict[str, dict[str, Any]] = {}
        for category_id, policy in STOREFRONT_POLICY.items():
            summary[category_id] = {
                "label": policy["label"],
                "fixed_attributes": dict(policy["fixed_attributes"]),
                "allowed_attributes": {
                    field: list(values) for field, values in policy["allowed_attributes"].items()
                },
                "recommended_defaults": dict(policy["recommended_defaults"]),
                "shipping": dict(policy["shipping"]),
                "notes": list(policy["notes"]),
                "kept_route_count": kept_by_category.get(category_id, 0),
                "removed_route_count": removed_by_category.get(category_id, 0),
            }
        return summary

    def _matches_policy(self, category_id: str, row: dict[str, Any]) -> bool:
        policy = STOREFRONT_POLICY.get(category_id)
        if policy is None:
            return True

        for field_name, required_value in policy["fixed_attributes"].items():
            if self._normalize_value(row.get(field_name)) != self._normalize_value(required_value):
                return False

        for field_name, allowed_values in policy["allowed_attributes"].items():
            normalized_value = self._normalize_value(row.get(field_name))
            allowed_normalized = {self._normalize_value(item) for item in allowed_values}
            if normalized_value not in allowed_normalized:
                return False

        return True

    def _normalize_value(self, value: Any) -> str:
        if value is None:
            return ""
        return str(value).strip().lower()
