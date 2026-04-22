from __future__ import annotations

from collections.abc import Iterable
from typing import Any


class ProdigiShippingPolicyService:
    """
    Pure policy layer for normalizing supplier shipping methods into stable
    storefront tiers and choosing which tier should be shown by default.

    We intentionally keep all available supplier tiers so the admin and future
    storefront can inspect the full choice set, while still exposing one
    preferred tier for the main product-card path.
    """

    DEFAULT_TIER_PRIORITY = (
        "express",
        "standard",
        "budget",
        "overnight",
        "other",
    )

    DISPLAY_TIER_ORDER = (
        "express",
        "standard",
        "budget",
        "overnight",
        "other",
    )

    def normalize_tier(
        self,
        shipping_method: str | None,
        service_level: str | None,
    ) -> str:
        text = " ".join(
            part.strip().lower()
            for part in (shipping_method, service_level)
            if part and part.strip()
        )
        if not text:
            return "other"
        if "overnight" in text or "next day" in text:
            return "overnight"
        if "express" in text or "expedited" in text:
            return "express"
        if "budget" in text or "economy" in text:
            return "budget"
        if "standard" in text:
            return "standard"
        return "other"

    def select_storefront_offer(
        self,
        offers: Iterable[dict[str, Any]],
        destination_country: str,
    ) -> dict[str, Any]:
        offers_list = [dict(item) for item in offers]
        if not offers_list:
            return {
                "default_offer": None,
                "shipping_profiles": [],
                "available_shipping_tiers": [],
                "default_shipping_tier": None,
            }

        tier_buckets: dict[str, list[dict[str, Any]]] = {}
        for offer in offers_list:
            tier = self.normalize_tier(
                offer.get("shipping_method"),
                offer.get("service_level"),
            )
            offer["shipping_tier"] = tier
            tier_buckets.setdefault(tier, []).append(offer)

        shipping_profiles: list[dict[str, Any]] = []
        for tier in self._sorted_tiers(tier_buckets):
            best_offer = min(
                tier_buckets[tier],
                key=lambda item: self._offer_rank(item, destination_country),
            )
            shipping_profiles.append(
                {
                    "tier": tier,
                    "shipping_method": best_offer.get("shipping_method"),
                    "service_name": best_offer.get("service_name"),
                    "service_level": best_offer.get("service_level"),
                    "source_country": best_offer.get("source_country"),
                    "currency": best_offer.get("currency"),
                    "product_price": best_offer.get("product_price"),
                    "shipping_price": best_offer.get("shipping_price"),
                    "total_cost": best_offer.get("total_cost"),
                    "delivery_days": best_offer.get("delivery_days"),
                    "min_shipping_days": best_offer.get("min_shipping_days"),
                    "max_shipping_days": best_offer.get("max_shipping_days"),
                }
            )

        default_profile = min(
            shipping_profiles,
            key=lambda item: self._profile_rank(item, destination_country),
        )
        default_tier = default_profile["tier"]
        default_offer = next(
            item
            for item in tier_buckets[default_tier]
            if self._offer_rank(item, destination_country)
            == min(
                self._offer_rank(candidate, destination_country)
                for candidate in tier_buckets[default_tier]
            )
        )

        return {
            "default_offer": default_offer,
            "shipping_profiles": shipping_profiles,
            "available_shipping_tiers": [item["tier"] for item in shipping_profiles],
            "default_shipping_tier": default_tier,
        }

    def summarize_group_shipping(
        self,
        size_options: Iterable[dict[str, Any]],
    ) -> dict[str, Any]:
        available_tiers = {
            profile["tier"]
            for size in size_options
            for profile in size.get("shipping_profiles", [])
            if profile.get("tier")
        }
        default_tiers = [
            size.get("default_shipping_tier")
            for size in size_options
            if size.get("default_shipping_tier")
        ]

        default_tier = None
        for tier in self.DEFAULT_TIER_PRIORITY:
            if tier in default_tiers:
                default_tier = tier
                break
        if default_tier is None and default_tiers:
            default_tier = default_tiers[0]

        return {
            "available_shipping_tiers": self._sorted_tiers({tier: [] for tier in available_tiers}),
            "default_shipping_tier": default_tier,
        }

    def _profile_rank(
        self,
        profile: dict[str, Any],
        destination_country: str,
    ) -> tuple[Any, ...]:
        return (
            self._tier_priority(profile.get("tier")),
            self._source_priority(profile.get("source_country"), destination_country),
            profile.get("max_shipping_days")
            if profile.get("max_shipping_days") is not None
            else 9999,
            profile.get("min_shipping_days")
            if profile.get("min_shipping_days") is not None
            else 9999,
            profile.get("total_cost") if profile.get("total_cost") is not None else 999999,
            profile.get("source_country") or "ZZ",
        )

    def _offer_rank(
        self,
        offer: dict[str, Any],
        destination_country: str,
    ) -> tuple[Any, ...]:
        return (
            self._source_priority(offer.get("source_country"), destination_country),
            offer.get("max_shipping_days") if offer.get("max_shipping_days") is not None else 9999,
            offer.get("min_shipping_days") if offer.get("min_shipping_days") is not None else 9999,
            offer.get("total_cost") if offer.get("total_cost") is not None else 999999,
            offer.get("currency") or "ZZZ",
            offer.get("shipping_method") or "ZZZ",
        )

    def _tier_priority(self, tier: str | None) -> int:
        if tier in self.DEFAULT_TIER_PRIORITY:
            return self.DEFAULT_TIER_PRIORITY.index(tier)
        return len(self.DEFAULT_TIER_PRIORITY)

    def _source_priority(
        self,
        source_country: str | None,
        destination_country: str,
    ) -> int:
        return 0 if (source_country or "") == destination_country else 1

    def _sorted_tiers(self, buckets: dict[str, Any]) -> list[str]:
        return sorted(
            buckets.keys(),
            key=lambda tier: (self._tier_priority(tier), tier),
        )
