from __future__ import annotations

from collections.abc import Iterable
from typing import Any


class ProdigiShippingSupportPolicyService:
    """
    Decides which shipping tier ArtShop is willing to subsidize as
    customer-facing free shipping.

    Policy goals:
    - prefer the fastest reasonable tier,
    - avoid obviously anomalous shipping spend,
    - produce a strict production-safe decision with no manual review state,
    - block routes that would make "free shipping" economically irresponsible.
    """

    FREE_SHIPPING_COVERED_CAP = 35.0

    EXPRESS_PREMIUM_CAP = 12.0
    EXPRESS_PREMIUM_MULTIPLIER = 1.4

    OVERNIGHT_PREMIUM_CAP = 8.0
    OVERNIGHT_PREMIUM_MULTIPLIER = 1.18
    OVERNIGHT_ABSOLUTE_CAP = 35.0

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
        eligible_tiers: list[str] = []

        baseline = self._pick_baseline(by_tier)
        chosen_profile = None

        if baseline is not None and self._is_within_covered_cap(baseline):
            chosen_profile = baseline
            eligible_tiers.append(baseline["tier"])

        express = by_tier.get("express")
        if express is not None and self._is_reasonable_express(express, baseline):
            chosen_profile = express
            eligible_tiers.append("express")

        reference_for_overnight = express or chosen_profile or baseline
        overnight = by_tier.get("overnight")
        if overnight is not None and self._is_reasonable_overnight(
            overnight,
            reference_for_overnight,
        ):
            chosen_profile = overnight
            eligible_tiers.append("overnight")

        if chosen_profile is None:
            cheapest = min(
                profiles,
                key=lambda item: item["shipping_price"]
                if item["shipping_price"] is not None
                else 999999,
            )
            return self._build_result(
                status="blocked",
                chosen_profile=None,
                eligible_tiers=[],
                note=(
                    "Shipping exists, but every available tier is above the current "
                    "free-shipping support cap."
                ),
                cheapest_shipping_price=cheapest["shipping_price"],
                cheapest_tier=cheapest["tier"],
            )

        note = self._build_note(chosen_profile)
        return self._build_result(
            status="covered",
            chosen_profile=chosen_profile,
            eligible_tiers=eligible_tiers,
            note=note,
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

    def serialize_policy_meta(self) -> dict[str, float]:
        return {
            "covered_cap": self.FREE_SHIPPING_COVERED_CAP,
            "express_premium_cap": self.EXPRESS_PREMIUM_CAP,
            "express_premium_multiplier": self.EXPRESS_PREMIUM_MULTIPLIER,
            "overnight_premium_cap": self.OVERNIGHT_PREMIUM_CAP,
            "overnight_premium_multiplier": self.OVERNIGHT_PREMIUM_MULTIPLIER,
            "overnight_absolute_cap": self.OVERNIGHT_ABSOLUTE_CAP,
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
                    "tier": str(tier),
                    "shipping_price": round(float(shipping_price), 2),
                }
            )
        return normalized

    def _pick_baseline(self, by_tier: dict[str, dict[str, Any]]) -> dict[str, Any] | None:
        return by_tier.get("standard") or by_tier.get("budget")

    def _is_within_covered_cap(self, profile: dict[str, Any]) -> bool:
        shipping_price = profile.get("shipping_price")
        return shipping_price is not None and shipping_price <= self.FREE_SHIPPING_COVERED_CAP

    def _is_reasonable_express(
        self,
        express: dict[str, Any],
        baseline: dict[str, Any] | None,
    ) -> bool:
        if not self._is_within_covered_cap(express):
            return False
        if baseline is None:
            return True

        baseline_price = baseline["shipping_price"]
        express_price = express["shipping_price"]
        return express_price <= min(
            baseline_price + self.EXPRESS_PREMIUM_CAP,
            baseline_price * self.EXPRESS_PREMIUM_MULTIPLIER,
        )

    def _is_reasonable_overnight(
        self,
        overnight: dict[str, Any],
        reference: dict[str, Any] | None,
    ) -> bool:
        overnight_price = overnight["shipping_price"]
        if overnight_price > min(
            self.FREE_SHIPPING_COVERED_CAP,
            self.OVERNIGHT_ABSOLUTE_CAP,
        ):
            return False
        if reference is None:
            return True

        reference_price = reference["shipping_price"]
        return overnight_price <= min(
            reference_price + self.OVERNIGHT_PREMIUM_CAP,
            reference_price * self.OVERNIGHT_PREMIUM_MULTIPLIER,
        )

    def _build_note(self, chosen_profile: dict[str, Any]) -> str:
        tier = chosen_profile["tier"]
        shipping_price = chosen_profile["shipping_price"]
        return (
            f"Free shipping can safely use {tier} at {shipping_price:.2f} "
            "under the current strict subsidy cap."
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
    ) -> dict[str, Any]:
        return {
            "status": status,
            "chosen_tier": chosen_profile["tier"] if chosen_profile else None,
            "chosen_shipping_price": (
                chosen_profile["shipping_price"] if chosen_profile else None
            ),
            "chosen_delivery_days": (
                chosen_profile.get("delivery_days") if chosen_profile else None
            ),
            "eligible_tiers": eligible_tiers,
            "note": note,
            "cheapest_shipping_price": cheapest_shipping_price,
            "cheapest_tier": cheapest_tier,
        }
