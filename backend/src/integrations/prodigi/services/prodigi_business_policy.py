from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal
from typing import Any


class ProdigiBusinessPolicyService:
    """
    Commercial policy layer for ArtShop print pricing.

    This layer is intentionally separate from:
    - supplier catalog import,
    - storefront bake materialization,
    - admin visualization.

    Responsibilities:
    - define category-level markup multipliers,
    - keep print product markup separate from delivery,
    - pass Prodigi print shipping through to the buyer at checkout,
    - keep original-art shipping policy separate from print-on-demand pricing.
    """

    POLICY_VERSION = "print_shipping_passthrough_v1"

    CATEGORY_MARKUP_MULTIPLIERS: dict[str, float] = {
        "paperPrintRolled": 3.0,
        "paperPrintBoxFramed": 2.7,
        "paperPrintClassicFramed": 2.7,
        "canvasRolled": 3.5,
        "canvasStretched": 3.2,
        "canvasClassicFrame": 3.1,
        "canvasFloatingFrame": 2.9,
    }

    CATEGORY_LABELS: dict[str, str] = {
        "paperPrintRolled": "Paper Print Unframed",
        "paperPrintBoxFramed": "Paper Print Box Framed",
        "paperPrintClassicFramed": "Paper Print Classic Framed",
        "canvasRolled": "Canvas Rolled",
        "canvasStretched": "Canvas Stretched",
        "canvasClassicFrame": "Canvas Classic Frame",
        "canvasFloatingFrame": "Canvas Floating Frame",
    }

    PRINT_SHIPPING_AT_CHECKOUT_CATEGORIES = {
        "paperPrintRolled",
        "canvasRolled",
        "paperPrintBoxFramed",
        "paperPrintClassicFramed",
        "canvasStretched",
        "canvasClassicFrame",
        "canvasFloatingFrame",
    }

    ENTRY_BADGE_CATEGORY_GROUPS: dict[str, tuple[str, ...]] = {
        "paper_print": ("paperPrintRolled",),
        "canvas": ("canvasRolled",),
    }

    PRINT_DELIVERY_SUBSIDY_BUDGET = 0.0

    ORIGINAL_ART_POLICY = {
        "min_price_usd": 1000.0,
        "max_price_usd": 4500.0,
        "shipping_mode": "included",
        "insured_shipping": True,
        "signature_required": True,
    }

    def get_markup_multiplier(
        self, category_id: str, *, multiplier_override: float | None = None
    ) -> float:
        if multiplier_override is not None:
            return multiplier_override
        return self.CATEGORY_MARKUP_MULTIPLIERS.get(category_id, 3.0)

    def evaluate_print_business_rules(
        self,
        *,
        category_id: str,
        market_segment: str,
        product_price: float | Decimal | None,
        shipping_support: dict[str, Any] | None,
        multiplier_override: float | None = None,
    ) -> dict[str, Any]:
        """
        Returns the recommended commercial handling for a print size.

        `shipping_mode` semantics:
        - `included`: reserved for original art, not Prodigi prints.
        - `pass_through`: buyer pays the selected Prodigi shipping at checkout.
        - `hide`: route is economically too toxic for automated storefront exposure.
        """

        shipping_support = shipping_support or {}
        multiplier = self.get_markup_multiplier(
            category_id, multiplier_override=multiplier_override
        )
        normalized_product_price = self._to_decimal(product_price)
        retail_product_price = None
        if normalized_product_price is not None:
            retail_product_price = self._money(normalized_product_price * Decimal(str(multiplier)))

        status = str(shipping_support.get("status") or "unavailable")
        chosen_shipping_price = self._to_decimal(shipping_support.get("chosen_shipping_price"))

        if category_id in self.PRINT_SHIPPING_AT_CHECKOUT_CATEGORIES:
            candidate_shipping = chosen_shipping_price if status == "covered" else None
            if candidate_shipping is None:
                return {
                    "markup_multiplier": multiplier,
                    "retail_product_price": retail_product_price,
                    "shipping_mode": "hide",
                    "policy_family": "print_shipping_at_checkout",
                    "customer_shipping_price": None,
                    "shipping_price_for_margin": Decimal("0.00"),
                    "shipping_reference_price": None,
                    "shipping_credit_applied": Decimal("0.00"),
                    "reason": (
                        shipping_support.get("reason")
                        or "No public shipping tier is available for automatic checkout."
                    ),
                }

            return {
                "markup_multiplier": multiplier,
                "retail_product_price": retail_product_price,
                "shipping_mode": "pass_through",
                "policy_family": "print_shipping_at_checkout",
                "customer_shipping_price": candidate_shipping,
                "shipping_price_for_margin": Decimal("0.00"),
                "shipping_reference_price": candidate_shipping,
                "shipping_credit_applied": Decimal("0.00"),
                "reason": ("Prodigi print shipping is passed through to the buyer at checkout."),
            }

        return {
            "markup_multiplier": multiplier,
            "retail_product_price": retail_product_price,
            "shipping_mode": "hide",
            "policy_family": "unknown",
            "customer_shipping_price": None,
            "shipping_price_for_margin": Decimal("0.00"),
            "shipping_reference_price": None,
            "shipping_credit_applied": Decimal("0.00"),
            "reason": "No automatic shipping support is available for this route.",
        }

    def build_original_art_policy(self) -> dict[str, Any]:
        return dict(self.ORIGINAL_ART_POLICY)

    def describe_category_policy(self, category_id: str) -> dict[str, Any]:
        return {
            "category_id": category_id,
            "label": self.CATEGORY_LABELS.get(category_id, category_id),
            "policy_family": "print_shipping_at_checkout",
            "markup_multiplier": self.get_markup_multiplier(category_id),
            "shipping_subsidy_budget": self.PRINT_DELIVERY_SUBSIDY_BUDGET,
        }

    def is_print_shipping_at_checkout_category(self, category_id: str) -> bool:
        return False

    def evaluate_country_entry_promos(
        self,
        category_summaries: dict[str, dict[str, Any]],
    ) -> dict[str, Any]:
        promos: dict[str, Any] = {}
        overall_missing: list[str] = []
        overall_blocked: list[str] = []

        for promo_id, category_ids in self.ENTRY_BADGE_CATEGORY_GROUPS.items():
            missing_categories: list[str] = []
            blocked_categories: list[str] = []

            for category_id in category_ids:
                summary = category_summaries.get(category_id)
                if not summary or summary.get("available_size_count", 0) <= 0:
                    missing_categories.append(category_id)
                    continue
                if summary.get("pass_through_size_count", 0) > 0:
                    blocked_categories.append(category_id)
                    continue
                if summary.get("hidden_size_count", 0) > 0:
                    blocked_categories.append(category_id)

            eligible = not missing_categories and not blocked_categories
            label = "Paper Print" if promo_id == "paper_print" else "Canvas"
            if eligible:
                note = f"{label} delivery promo is disabled for Prodigi prints."
            elif missing_categories:
                note = f"Do not show {label} delivery promo: required category is missing."
            else:
                note = f"Do not show {label} delivery promo: print shipping is charged at checkout."

            promos[promo_id] = {
                "eligible": eligible,
                "note": note,
                "missing_categories": missing_categories,
                "blocked_categories": blocked_categories,
            }
            overall_missing.extend(missing_categories)
            overall_blocked.extend(blocked_categories)

        promos["overall"] = {
            "eligible": all(item["eligible"] for item in promos.values()),
            "note": (
                "Delivery entry promos are disabled for Prodigi prints."
                if all(item["eligible"] for item in promos.values())
                else "Prodigi print shipping is charged at checkout."
            ),
            "missing_categories": overall_missing,
            "blocked_categories": overall_blocked,
        }
        return promos

    def _to_decimal(self, value: float | Decimal | None) -> Decimal | None:
        if value is None:
            return None
        if isinstance(value, Decimal):
            return value
        return Decimal(str(value))

    def _money(self, value: Decimal) -> Decimal:
        return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
