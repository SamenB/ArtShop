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
    - define where "free delivery" is a storefront promise,
    - decide when shipping should be passed through to the buyer,
    - automatically hide economically toxic routes from a future automated storefront.
    """

    CATEGORY_MARKUP_MULTIPLIERS: dict[str, float] = {
        "paperPrintRolled": 3.0,
        "paperPrintBoxFramed": 2.7,
        "paperPrintBoxFramedMounted": 2.7,
        "paperPrintClassicFramed": 2.7,
        "paperPrintClassicFramedMounted": 2.7,
        "canvasRolled": 3.5,
        "canvasStretched": 3.2,
        "canvasClassicFrame": 3.1,
        "canvasFloatingFrame": 2.9,
    }

    CATEGORY_LABELS: dict[str, str] = {
        "paperPrintRolled": "Paper Print Unframed",
        "paperPrintBoxFramed": "Paper Print Box Framed",
        "paperPrintBoxFramedMounted": "Paper Print Box Framed with Mount",
        "paperPrintClassicFramed": "Paper Print Classic Framed",
        "paperPrintClassicFramedMounted": "Paper Print Classic Framed with Mount",
        "canvasRolled": "Canvas Rolled",
        "canvasStretched": "Canvas Stretched",
        "canvasClassicFrame": "Canvas Classic Frame",
        "canvasFloatingFrame": "Canvas Floating Frame",
    }

    UNFRAMED_FREE_DELIVERY_CATEGORIES = {
        "paperPrintRolled",
        "canvasRolled",
    }

    SHIPPING_AT_CHECKOUT_CATEGORIES = {
        "paperPrintBoxFramed",
        "paperPrintBoxFramedMounted",
        "paperPrintClassicFramed",
        "paperPrintClassicFramedMounted",
        "canvasStretched",
        "canvasClassicFrame",
        "canvasFloatingFrame",
    }

    ENTRY_BADGE_CATEGORY_GROUPS: dict[str, tuple[str, ...]] = {
        "paper_print": ("paperPrintRolled",),
        "canvas": ("canvasRolled",),
    }

    UNFRAMED_DELIVERY_SUBSIDY_BUDGET = 30.0

    STANDARD_PASS_THROUGH_CAP = 45.0
    PREMIUM_PASS_THROUGH_CAP = 60.0
    HARD_HIDE_SHIPPING_CAP = 95.0

    PREMIUM_CATEGORIES = {
        "paperPrintBoxFramed",
        "paperPrintBoxFramedMounted",
        "paperPrintClassicFramed",
        "paperPrintClassicFramedMounted",
        "canvasStretched",
        "canvasClassicFrame",
        "canvasFloatingFrame",
    }

    ORIGINAL_ART_POLICY = {
        "min_price_usd": 1000.0,
        "max_price_usd": 4500.0,
        "shipping_mode": "included",
        "insured_shipping": True,
        "signature_required": True,
    }

    def get_markup_multiplier(self, category_id: str) -> float:
        return self.CATEGORY_MARKUP_MULTIPLIERS.get(category_id, 3.0)

    def evaluate_print_business_rules(
        self,
        *,
        category_id: str,
        market_segment: str,
        product_price: float | Decimal | None,
        shipping_support: dict[str, Any] | None,
    ) -> dict[str, Any]:
        """
        Returns the recommended commercial handling for a print size.

        `shipping_mode` semantics:
        - `included`: free delivery promised to the buyer, funded by margin.
        - `pass_through`: buyer sees shipping separately at checkout.
        - `hide`: route is economically too toxic for automated storefront exposure.
        """

        shipping_support = shipping_support or {}
        multiplier = self.get_markup_multiplier(category_id)
        normalized_product_price = self._to_decimal(product_price)
        retail_product_price = None
        if normalized_product_price is not None:
            retail_product_price = self._money(normalized_product_price * Decimal(str(multiplier)))

        status = str(shipping_support.get("status") or "unavailable")
        chosen_shipping_price = self._to_decimal(shipping_support.get("chosen_shipping_price"))
        cheapest_shipping_price = self._to_decimal(shipping_support.get("cheapest_shipping_price"))

        if category_id in self.UNFRAMED_FREE_DELIVERY_CATEGORIES:
            candidate_shipping = (
                chosen_shipping_price
                if status == "covered" and chosen_shipping_price is not None
                else cheapest_shipping_price
            )
            if candidate_shipping is None:
                return {
                    "markup_multiplier": multiplier,
                    "retail_product_price": retail_product_price,
                    "shipping_mode": "hide",
                    "free_delivery_badge": False,
                    "policy_family": "unframed_free_delivery",
                    "customer_shipping_price": None,
                    "shipping_price_for_margin": Decimal("0.00"),
                    "shipping_reference_price": None,
                    "shipping_credit_applied": Decimal("0.00"),
                    "reason": "No stable automatic shipping candidate is available.",
                }

            subsidy_budget = Decimal(str(self.UNFRAMED_DELIVERY_SUBSIDY_BUDGET))
            if candidate_shipping <= subsidy_budget:
                return {
                    "markup_multiplier": multiplier,
                    "retail_product_price": retail_product_price,
                    "shipping_mode": "included",
                    "free_delivery_badge": True,
                    "policy_family": "unframed_free_delivery",
                    "customer_shipping_price": Decimal("0.00"),
                    "shipping_price_for_margin": candidate_shipping,
                    "shipping_reference_price": candidate_shipping,
                    "shipping_credit_applied": candidate_shipping,
                    "reason": (
                        "Unframed print fits inside the fixed delivery credit budget."
                    ),
                }

            if candidate_shipping <= Decimal(str(self.HARD_HIDE_SHIPPING_CAP)):
                customer_shipping_price = candidate_shipping - subsidy_budget
                if customer_shipping_price < Decimal("0.00"):
                    customer_shipping_price = Decimal("0.00")
                return {
                    "markup_multiplier": multiplier,
                    "retail_product_price": retail_product_price,
                    "shipping_mode": "pass_through",
                    "free_delivery_badge": False,
                    "policy_family": "unframed_free_delivery",
                    "customer_shipping_price": customer_shipping_price,
                    "shipping_price_for_margin": subsidy_budget,
                    "shipping_reference_price": candidate_shipping,
                    "shipping_credit_applied": subsidy_budget,
                    "reason": (
                        "Unframed print exceeds the fixed delivery credit, so the buyer only "
                        "pays the remainder above the subsidy budget."
                    ),
                }

            return {
                "markup_multiplier": multiplier,
                "retail_product_price": retail_product_price,
                "shipping_mode": "hide",
                "free_delivery_badge": False,
                "policy_family": "unframed_free_delivery",
                "customer_shipping_price": None,
                "shipping_price_for_margin": Decimal("0.00"),
                "shipping_reference_price": candidate_shipping,
                "shipping_credit_applied": Decimal("0.00"),
                "reason": (
                    "Unframed print shipping is too expensive even after applying the fixed "
                    "delivery credit."
                ),
            }

        if category_id in self.SHIPPING_AT_CHECKOUT_CATEGORIES:
            candidate_shipping = (
                chosen_shipping_price
                if status == "covered" and chosen_shipping_price is not None
                else cheapest_shipping_price
            )
            if candidate_shipping is None:
                return {
                    "markup_multiplier": multiplier,
                    "retail_product_price": retail_product_price,
                    "shipping_mode": "hide",
                    "free_delivery_badge": False,
                    "policy_family": "shipping_at_checkout",
                    "customer_shipping_price": None,
                    "shipping_price_for_margin": Decimal("0.00"),
                    "shipping_reference_price": None,
                    "shipping_credit_applied": Decimal("0.00"),
                    "reason": "No stable automatic shipping candidate is available.",
                }

            if candidate_shipping > Decimal(str(self.HARD_HIDE_SHIPPING_CAP)):
                return {
                    "markup_multiplier": multiplier,
                    "retail_product_price": retail_product_price,
                    "shipping_mode": "hide",
                    "free_delivery_badge": False,
                    "policy_family": "shipping_at_checkout",
                    "customer_shipping_price": None,
                    "shipping_price_for_margin": Decimal("0.00"),
                    "shipping_reference_price": candidate_shipping,
                    "shipping_credit_applied": Decimal("0.00"),
                    "reason": (
                        "Shipping is far beyond the automatic storefront comfort zone and should "
                        "not be exposed in a low-friction checkout."
                    ),
                }

            pass_through_cap = Decimal(
                str(
                    self.PREMIUM_PASS_THROUGH_CAP
                    if category_id in self.PREMIUM_CATEGORIES
                    else self.STANDARD_PASS_THROUGH_CAP
                )
            )
            if candidate_shipping <= pass_through_cap:
                return {
                    "markup_multiplier": multiplier,
                    "retail_product_price": retail_product_price,
                    "shipping_mode": "pass_through",
                    "free_delivery_badge": False,
                    "policy_family": "shipping_at_checkout",
                    "customer_shipping_price": candidate_shipping,
                    "shipping_price_for_margin": Decimal("0.00"),
                    "shipping_reference_price": candidate_shipping,
                    "shipping_credit_applied": Decimal("0.00"),
                    "reason": (
                        "This category belongs to the shipping-at-checkout group, and the route "
                        "is still reasonable enough for automated storefront use."
                    ),
                }

            return {
                "markup_multiplier": multiplier,
                "retail_product_price": retail_product_price,
                "shipping_mode": "hide",
                "free_delivery_badge": False,
                "policy_family": "shipping_at_checkout",
                "customer_shipping_price": None,
                "shipping_price_for_margin": Decimal("0.00"),
                "shipping_reference_price": candidate_shipping,
                "shipping_credit_applied": Decimal("0.00"),
                "reason": (
                    "Shipping is too expensive for the current shipping-at-checkout model."
                ),
            }

        return {
            "markup_multiplier": multiplier,
            "retail_product_price": retail_product_price,
            "shipping_mode": "hide",
            "free_delivery_badge": False,
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
            "policy_family": (
                "unframed_free_delivery"
                if category_id in self.UNFRAMED_FREE_DELIVERY_CATEGORIES
                else "shipping_at_checkout"
            ),
            "markup_multiplier": self.get_markup_multiplier(category_id),
            "unframed_delivery_subsidy_budget": (
                self.UNFRAMED_DELIVERY_SUBSIDY_BUDGET
                if category_id in self.UNFRAMED_FREE_DELIVERY_CATEGORIES
                else 0.0
            ),
            "standard_pass_through_cap": (
                self.PREMIUM_PASS_THROUGH_CAP
                if category_id in self.PREMIUM_CATEGORIES
                else self.STANDARD_PASS_THROUGH_CAP
            ),
            "hard_hide_shipping_cap": self.HARD_HIDE_SHIPPING_CAP,
        }

    def is_unframed_free_delivery_category(self, category_id: str) -> bool:
        return category_id in self.UNFRAMED_FREE_DELIVERY_CATEGORIES

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
                if summary.get("included_size_count", 0) <= 0:
                    blocked_categories.append(category_id)
                    continue
                if summary.get("pass_through_size_count", 0) > 0:
                    blocked_categories.append(category_id)
                    continue
                if summary.get("hidden_size_count", 0) > 0:
                    blocked_categories.append(category_id)

            eligible = not missing_categories and not blocked_categories
            label = "Paper Print" if promo_id == "paper_print" else "Canvas"
            if eligible:
                note = f"This country can show the entry badge: Free delivery, {label}."
            elif missing_categories:
                note = f"Do not show Free delivery, {label}: required category is missing."
            else:
                note = f"Do not show Free delivery, {label}: some sizes still require extra shipping."

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
                "Both paper print and canvas entry badges are eligible."
                if all(item["eligible"] for item in promos.values())
                else "At least one unframed family cannot honestly carry a full free-delivery badge."
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
