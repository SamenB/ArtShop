from __future__ import annotations

from collections.abc import Iterable
from typing import Any


class ProdigiShippingSupportPolicyService:
    """
    Decides which shipping tier ArtShop should expose as the stable
    customer-facing checkout shipping quote.

    Policy goals:
    - prefer the fastest public tier that stays under the checkout cap,
    - produce a strict production-safe decision with no manual review state,
    - fall back to Standard above cap when every preferred tier is over cap,
    - fall back to the cheapest available tier only when Standard is absent.
    """

    CHECKOUT_SHIPPING_CAP = 35.0
    PREFERRED_TIERS = ("overnight", "express", "standardplus", "standard", "budget")
    CANONICAL_SHIPPING_METHODS = {
        "budget": "Budget",
        "express": "Express",
        "overnight": "Overnight",
        "standard": "Standard",
        "standardplus": "StandardPlus",
    }

    def __init__(self, config: dict[str, Any] | None = None):
        self.checkout_shipping_cap = float(
            (config or {}).get("checkout_shipping_cap", self.CHECKOUT_SHIPPING_CAP)
        )
        self.preferred_tiers = tuple(
            str(item).strip().lower()
            for item in (config or {}).get("preferred_tier_order", self.PREFERRED_TIERS)
        )
        self.fallback_when_none_under_cap = str(
            (config or {}).get("fallback_when_none_under_cap", "standard_then_cheapest")
        )
        self.fallback_tier = str((config or {}).get("fallback_tier", "standard")).lower()

    def configure(self, config: dict[str, Any]) -> None:
        self.__init__(config)

    def set_config(self, config: dict[str, Any]) -> None:
        self.configure(config)

    def evaluate_size(
        self,
        shipping_profiles: Iterable[dict[str, Any]] | None,
    ) -> dict[str, Any]:
        profiles = self._normalize_profiles(shipping_profiles)
        if not profiles:
            return self._build_result(
                status="unavailable",
                chosen_profile=None,
                eligible_tiers=[],
                note="No supplier shipping tier is available for this size.",
            )

        by_tier = {item["tier"]: item for item in profiles}
        eligible_tiers = [
            tier
            for tier in self.preferred_tiers
            if tier in by_tier and self._is_within_checkout_cap(by_tier[tier])
        ]
        chosen_profile = next(
            (by_tier[tier] for tier in self.preferred_tiers if tier in eligible_tiers),
            None,
        )
        selection_reason = "under_cap_preferred"

        if chosen_profile is None:
            chosen_profile = self._fallback_profile(by_tier=by_tier, profiles=profiles)
            if chosen_profile is not None:
                selection_reason = (
                    "fallback_standard_over_cap"
                    if chosen_profile["tier"] == self.fallback_tier
                    else "fallback_cheapest_missing_standard"
                )
            else:
                cheapest = self._cheapest_profile(profiles)
                return self._build_result(
                    status="blocked",
                    chosen_profile=None,
                    eligible_tiers=[],
                    note=(
                        "No public shipping tier is available under the "
                        "current automatic checkout cap."
                    ),
                    cheapest_shipping_price=cheapest["shipping_price"] if cheapest else None,
                    cheapest_tier=cheapest["tier"] if cheapest else None,
                    available_profiles=profiles,
                    selection_reason="blocked_no_fallback",
                )

        note = self._build_note(chosen_profile, selection_reason)
        return self._build_result(
            status="covered",
            chosen_profile=chosen_profile,
            eligible_tiers=eligible_tiers,
            note=note,
            available_profiles=profiles,
            selection_reason=selection_reason,
        )

    def summarize_group(self, size_entries: Iterable[dict[str, Any]]) -> dict[str, Any]:
        covered = 0
        review = 0
        blocked = 0
        unavailable = 0
        chosen_tiers: dict[str, int] = {}
        supported_prices: list[float] = []

        for item in size_entries:
            support = item.get("shipping_support") or {}
            status = support.get("status")
            if status == "covered":
                covered += 1
            elif status == "blocked":
                blocked += 1
            else:
                unavailable += 1

            chosen_tier = support.get("chosen_tier")
            if chosen_tier:
                chosen_tiers[chosen_tier] = chosen_tiers.get(chosen_tier, 0) + 1

            price = support.get("chosen_shipping_price")
            if price is not None:
                supported_prices.append(float(price))

        status = "unavailable"
        if covered > 0 and blocked == 0:
            status = "covered"
        elif blocked > 0:
            status = "blocked"

        dominant_tier = None
        if chosen_tiers:
            dominant_tier = max(
                chosen_tiers.items(),
                key=lambda item: (item[1], item[0]),
            )[0]

        return {
            "status": status,
            "covered_size_count": covered,
            "review_size_count": review,
            "blocked_size_count": blocked,
            "unavailable_size_count": unavailable,
            "dominant_tier": dominant_tier,
            "chosen_tier_counts": chosen_tiers,
            "min_supported_shipping_price": min(supported_prices) if supported_prices else None,
            "max_supported_shipping_price": max(supported_prices) if supported_prices else None,
            "policy_meta": self.serialize_policy_meta(),
        }

    def serialize_policy_meta(self) -> dict[str, Any]:
        return {
            "checkout_shipping_cap": self.checkout_shipping_cap,
            "preferred_tier_order": list(self.preferred_tiers),
            "fallback_when_none_under_cap": self.fallback_when_none_under_cap,
            "fallback_tier": self.fallback_tier,
        }

    def _normalize_profiles(
        self,
        shipping_profiles: Iterable[dict[str, Any]] | None,
    ) -> list[dict[str, Any]]:
        normalized: list[dict[str, Any]] = []
        for item in shipping_profiles or []:
            tier = item.get("tier")
            shipping_price = item.get("shipping_price")
            if not tier or shipping_price is None:
                continue

            normalized.append(
                {
                    **item,
                    "tier": str(tier).strip().lower(),
                    "shipping_method": self._canonical_shipping_method(str(tier), item),
                    "shipping_price": round(float(shipping_price), 2),
                    "product_price": self._float_or_none(item.get("product_price")),
                    "currency": item.get("currency"),
                }
            )
        return normalized

    def _is_within_checkout_cap(self, profile: dict[str, Any]) -> bool:
        shipping_price = profile.get("shipping_price")
        return shipping_price is not None and shipping_price <= self.checkout_shipping_cap

    def _fallback_profile(
        self,
        *,
        by_tier: dict[str, dict[str, Any]],
        profiles: list[dict[str, Any]],
    ) -> dict[str, Any] | None:
        if self.fallback_when_none_under_cap == "block":
            return None
        if self.fallback_when_none_under_cap == "standard_then_cheapest":
            if self.fallback_tier in by_tier:
                return by_tier[self.fallback_tier]
            return self._cheapest_profile(profiles)
        if self.fallback_when_none_under_cap == "cheapest":
            return self._cheapest_profile(profiles)
        return None

    def _cheapest_profile(self, profiles: list[dict[str, Any]]) -> dict[str, Any] | None:
        if not profiles:
            return None
        return min(
            profiles,
            key=lambda item: item["shipping_price"]
            if item["shipping_price"] is not None
            else 999999,
        )

    def _build_note(self, chosen_profile: dict[str, Any], selection_reason: str) -> str:
        tier = chosen_profile["tier"]
        shipping_price = chosen_profile["shipping_price"]
        if selection_reason == "fallback_standard_over_cap":
            return (
                f"Checkout shipping uses {tier} at {shipping_price:.2f}; no preferred tier "
                "was available under the automatic checkout cap, so Standard is used."
            )
        if selection_reason == "fallback_cheapest_missing_standard":
            return (
                f"Checkout shipping uses {tier} at {shipping_price:.2f}; no preferred tier "
                "was available under the automatic checkout cap and Standard is missing."
            )
        return (
            f"Checkout shipping uses {tier} at {shipping_price:.2f} under the "
            "speed-under-cap support policy."
        )

    def _build_result(
        self,
        *,
        status: str,
        chosen_profile: dict[str, Any] | None,
        eligible_tiers: list[str],
        note: str,
        cheapest_shipping_price: float | None = None,
        cheapest_tier: str | None = None,
        available_profiles: list[dict[str, Any]] | None = None,
        selection_reason: str | None = None,
    ) -> dict[str, Any]:
        return {
            "status": status,
            "chosen_tier": chosen_profile["tier"] if chosen_profile else None,
            "chosen_shipping_method": (
                chosen_profile["shipping_method"] if chosen_profile else None
            ),
            "chosen_shipping_price": (
                chosen_profile["shipping_price"] if chosen_profile else None
            ),
            "chosen_product_price": (
                chosen_profile.get("product_price") if chosen_profile else None
            ),
            "chosen_currency": chosen_profile.get("currency") if chosen_profile else None,
            "chosen_delivery_days": (
                chosen_profile.get("delivery_days") if chosen_profile else None
            ),
            "eligible_tiers": eligible_tiers,
            "available_tiers": [item["tier"] for item in available_profiles or []],
            "available_profiles": available_profiles or [],
            "note": note,
            "reason": note,
            "selection_reason": selection_reason,
            "cheapest_shipping_price": cheapest_shipping_price,
            "cheapest_tier": cheapest_tier,
        }

    def _canonical_shipping_method(self, tier: str, item: dict[str, Any]) -> str:
        normalized = tier.strip().lower()
        return self.CANONICAL_SHIPPING_METHODS.get(
            normalized,
            str(item.get("shipping_method") or tier).strip(),
        )

    def _float_or_none(self, value: Any) -> float | None:
        if value is None:
            return None
        try:
            return round(float(value), 2)
        except (TypeError, ValueError):
            return None
