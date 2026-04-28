from __future__ import annotations

import json
from collections import defaultdict
from decimal import Decimal
from types import SimpleNamespace
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from src.init import redis_manager
from src.integrations.prodigi.repositories.prodigi_storefront import ProdigiStorefrontRepository
from src.integrations.prodigi.services.prodigi_business_policy import ProdigiBusinessPolicyService
from src.integrations.prodigi.services.prodigi_catalog_preview import (
    DEFAULT_RATIO_PRESETS,
    ProdigiCatalogPreviewService,
)
from src.integrations.prodigi.services.prodigi_fulfillment_policy import EUROPE_COUNTRY_CODES
from src.integrations.prodigi.services.prodigi_market_priority import get_market_priority
from src.integrations.prodigi.services.prodigi_shipping_support_policy import (
    ProdigiShippingSupportPolicyService,
)
from src.models.print_pricing_regions import PrintPricingRegionOrm
from src.utils.db_manager import DBManager


class ProdigiStorefrontSnapshotService:
    """
    Read-only service for visualizing the active baked storefront snapshot.

    Responsibilities:
    - load the active bake,
    - normalize it into a dense admin visualization payload,
    - expose all countries at once for a selected ratio.
    """

    def __init__(self, db: DBManager):
        self.db = db
        self.repository = ProdigiStorefrontRepository(db.session)
        self.shipping_support_policy = ProdigiShippingSupportPolicyService()
        self.business_policy = ProdigiBusinessPolicyService()
        self.cache_ttl_seconds = 3600
        self._regional_multipliers: dict[str, dict[str, float]] | None = None
        self._regional_defaults: dict[str, float] | None = None

    async def get_snapshot_visualization(
        self,
        selected_ratio: str | None = None,
    ) -> dict[str, Any]:
        active_bake = await self.repository.get_active_bake()
        await self._load_regional_multipliers()
        if active_bake is None:
            return {
                "has_active_bake": False,
                "message": "No active storefront snapshot exists yet.",
                "ratios": [],
                "selected_ratio": selected_ratio,
                "categories": [],
                "countries": [],
            }

        ratio_rows = await self.repository.get_bake_ratios(active_bake.id)
        if not ratio_rows:
            return {
                "has_active_bake": True,
                "message": "Active storefront snapshot exists, but it has no baked groups.",
                "bake": self._serialize_bake(active_bake),
                "ratios": [],
                "selected_ratio": selected_ratio,
                "categories": [],
                "countries": [],
            }

        ratio_options = self._sort_ratio_rows(ratio_rows)
        valid_ratios = {item["ratio_label"] for item in ratio_options}
        if selected_ratio not in valid_ratios:
            selected_ratio = ratio_options[0]["ratio_label"]

        groups = await self.repository.get_ratio_groups(active_bake.id, selected_ratio)
        payload = self._build_ratio_visualization(
            bake=active_bake,
            selected_ratio=selected_ratio,
            ratio_options=ratio_options,
            groups=groups,
        )
        payload["has_active_bake"] = True
        payload["message"] = "Active storefront snapshot loaded."
        return payload

    async def get_country_storefront(
        self,
        *,
        selected_ratio: str,
        country_code: str,
    ) -> dict[str, Any]:
        active_bake = await self.repository.get_active_bake()
        await self._load_regional_multipliers()
        if active_bake is None:
            return {
                "has_active_bake": False,
                "message": "No active storefront snapshot exists yet.",
                "selected_ratio": selected_ratio,
                "country_code": country_code,
                "country_name": None,
                "available_country_codes": [],
                "categories": [],
                "category_cells": [],
            }

        ratio_rows = await self.repository.get_bake_ratios(active_bake.id)
        if not ratio_rows:
            return {
                "has_active_bake": True,
                "message": "Active storefront snapshot exists, but it has no baked groups.",
                "bake": self._serialize_bake(active_bake),
                "selected_ratio": selected_ratio,
                "country_code": country_code,
                "country_name": None,
                "available_country_codes": [],
                "categories": [],
                "category_cells": [],
            }

        ratio_options = self._sort_ratio_rows(ratio_rows)
        valid_ratios = {item["ratio_label"] for item in ratio_options}
        if selected_ratio not in valid_ratios:
            return {
                "has_active_bake": True,
                "message": f"Ratio {selected_ratio} is not present in the active storefront snapshot.",
                "bake": self._serialize_bake(active_bake),
                "selected_ratio": selected_ratio,
                "country_code": country_code,
                "country_name": None,
                "available_country_codes": [],
                "categories": [],
                "category_cells": [],
            }

        normalized_country = (country_code or "").upper()
        cache_key = (
            f"prodigi:country-storefront:v1:{self.business_policy.POLICY_VERSION}:"
            f"bake:{active_bake.id}:"
            f"ratio:{selected_ratio}:country:{normalized_country}"
        )
        cached_payload = await self._get_cached_payload(cache_key)
        if cached_payload is not None:
            return cached_payload

        available_country_codes = await self.repository.get_ratio_country_codes(
            active_bake.id,
            selected_ratio,
        )
        groups = await self.repository.get_ratio_country_groups(
            active_bake.id,
            selected_ratio,
            normalized_country,
        )
        if not groups:
            return {
                "has_active_bake": True,
                "message": (
                    f"No baked storefront offer is currently available for {normalized_country} "
                    f"under ratio {selected_ratio}."
                ),
                "bake": self._serialize_bake(active_bake),
                "selected_ratio": selected_ratio,
                "country_code": normalized_country,
                "country_name": None,
                "available_country_codes": available_country_codes,
                "categories": [],
                "category_cells": [],
            }

        category_defs = ProdigiCatalogPreviewService(
            SimpleNamespace(session=None)
        ).get_category_defs(active_bake.paper_material)
        category_sort = {item["id"]: item["sort_order"] for item in category_defs}

        sorted_groups = sorted(
            groups,
            key=lambda group: (
                category_sort.get(group.category_id, 999),
                group.category_label,
                group.category_id,
            ),
        )

        categories = []
        category_cells = []
        for group in sorted_groups:
            category = {
                "category_id": group.category_id,
                "label": group.category_label,
                "material_label": group.material_label,
                "frame_label": group.frame_label,
                "baseline_size_labels": sorted(
                    {size.slot_size_label for size in group.sizes},
                    key=self._size_sort_key,
                ),
                "fixed_attributes": group.fixed_attributes or {},
                "recommended_defaults": group.recommended_defaults or {},
                "allowed_attributes": group.allowed_attributes or {},
                "sort_order": category_sort.get(group.category_id, 999),
            }
            categories.append(category)
            category_cells.append(
                self._build_group_cell(
                    category=category,
                    destination_country=normalized_country,
                    group=group,
                    size_lookup={size.slot_size_label: size for size in group.sizes},
                )
            )

        payload = {
            "has_active_bake": True,
            "message": "Country storefront slice loaded from the active baked snapshot.",
            "bake": self._serialize_bake(active_bake),
            "selected_ratio": selected_ratio,
            "country_code": normalized_country,
            "country_name": sorted_groups[0].destination_country_name or normalized_country,
            "available_country_codes": available_country_codes,
            "categories": categories,
            "category_cells": category_cells,
            "shipping_summary": self._build_country_shipping_summary(category_cells),
            "market_priority": get_market_priority(normalized_country),
            "entry_promo": self._build_country_entry_promo(category_cells),
        }
        await self._set_cached_payload(cache_key, payload)
        return payload

    async def _load_regional_multipliers(self) -> None:
        """Pre-load all pricing regions into an in-memory country→multipliers lookup."""
        if self._regional_multipliers is not None:
            return
        self._regional_multipliers = {}
        self._regional_defaults = {}
        try:
            regions = (
                (
                    await self.db.session.execute(
                        select(PrintPricingRegionOrm)
                        .options(selectinload(PrintPricingRegionOrm.multipliers))
                        .order_by(PrintPricingRegionOrm.sort_order)
                    )
                )
                .scalars()
                .all()
            )
        except Exception:
            return

        fallback_default = 3.0
        fallback_overrides: dict[str, float] = {}

        for region in regions:
            overrides = {m.category_id: m.multiplier for m in region.multipliers}
            if region.is_fallback:
                fallback_default = region.default_multiplier
                fallback_overrides = overrides
                continue
            for cc in region.country_codes or []:
                self._regional_multipliers[cc.upper()] = overrides
                self._regional_defaults[cc.upper()] = region.default_multiplier

        self._fallback_default = fallback_default
        self._fallback_overrides = fallback_overrides

    def _resolve_multiplier(self, country_code: str, category_id: str) -> float | None:
        """Return the DB-backed regional multiplier, or None to use the hardcoded default."""
        if self._regional_multipliers is None:
            return None
        normalized = (country_code or "").upper()
        overrides = self._regional_multipliers.get(normalized)
        if overrides is not None:
            if category_id in overrides:
                return overrides[category_id]
            return self._regional_defaults.get(normalized, 3.0)
        # Use fallback region
        fallback_overrides = getattr(self, "_fallback_overrides", {})
        if category_id in fallback_overrides:
            return fallback_overrides[category_id]
        return getattr(self, "_fallback_default", None)

    async def _get_cached_payload(self, key: str) -> dict[str, Any] | None:
        if redis_manager.redis is None:
            return None
        cached = await redis_manager.get(key)
        if not cached:
            return None
        try:
            return json.loads(cached)
        except json.JSONDecodeError:
            return None

    async def _set_cached_payload(self, key: str, payload: dict[str, Any]) -> None:
        if redis_manager.redis is None:
            return
        await redis_manager.set(key, json.dumps(payload), expire=self.cache_ttl_seconds)

    def _build_ratio_visualization(
        self,
        *,
        bake: Any,
        selected_ratio: str,
        ratio_options: list[dict[str, Any]],
        groups: list[Any],
    ) -> dict[str, Any]:
        category_defs = ProdigiCatalogPreviewService(
            SimpleNamespace(session=None)
        ).get_category_defs(bake.paper_material)
        category_sort = {item["id"]: item["sort_order"] for item in category_defs}
        category_fallback = {item["id"]: item for item in category_defs}

        baseline_sizes: dict[str, set[str]] = defaultdict(set)
        groups_by_country: dict[str, dict[str, Any]] = defaultdict(dict)
        country_names: dict[str, str] = {}

        for group in groups:
            country_code = group.destination_country
            groups_by_country[country_code][group.category_id] = group
            country_names[country_code] = group.destination_country_name or country_code
            for size in group.sizes:
                baseline_sizes[group.category_id].add(size.slot_size_label)

        categories = []
        for category_id in sorted(
            {group.category_id for group in groups},
            key=lambda item: (
                category_sort.get(item, 999),
                item,
            ),
        ):
            sample_group = next(group for group in groups if group.category_id == category_id)
            fallback = category_fallback.get(category_id)
            categories.append(
                {
                    "category_id": category_id,
                    "label": sample_group.category_label,
                    "material_label": sample_group.material_label,
                    "frame_label": sample_group.frame_label,
                    "baseline_size_labels": sorted(
                        baseline_sizes.get(category_id, set()),
                        key=self._size_sort_key,
                    ),
                    "fixed_attributes": sample_group.fixed_attributes or {},
                    "recommended_defaults": sample_group.recommended_defaults or {},
                    "allowed_attributes": sample_group.allowed_attributes or {},
                    "sort_order": category_sort.get(
                        category_id, fallback["sort_order"] if fallback else 999
                    ),
                }
            )

        countries = []
        for country_code in country_names:
            category_cells = []
            for category in categories:
                group = groups_by_country[country_code].get(category["category_id"])
                if group is None:
                    category_cells.append(
                        self._build_missing_cell(
                            category=category,
                        )
                    )
                    continue

                size_lookup = {size.slot_size_label: size for size in group.sizes}
                category_cells.append(
                    self._build_group_cell(
                        category=category,
                        destination_country=country_code,
                        group=group,
                        size_lookup=size_lookup,
                    )
                )

            shipping_summary = self._build_country_shipping_summary(category_cells)
            market_priority = get_market_priority(country_code)
            entry_promo = self._build_country_entry_promo(category_cells)

            countries.append(
                {
                    "country_code": country_code,
                    "country_name": country_names[country_code],
                    "market_priority": market_priority,
                    "shipping_summary": shipping_summary,
                    "entry_promo": entry_promo,
                    "category_cells": category_cells,
                }
            )

        countries.sort(
            key=lambda item: (
                item["market_priority"]["rank"],
                item["country_name"],
            )
        )

        priority_market_summary = self._build_priority_market_summary(
            countries=countries,
            categories=categories,
        )

        entry_promo_summary = self._build_entry_promo_summary(countries)

        return {
            "bake": self._serialize_bake(bake),
            "ratios": ratio_options,
            "selected_ratio": selected_ratio,
            "shipping_support_policy": self.shipping_support_policy.serialize_policy_meta(),
            "business_policy": self._serialize_business_policy_meta(),
            "categories": categories,
            "countries": countries,
            "priority_market_summary": priority_market_summary,
            "entry_promo_summary": entry_promo_summary,
        }

    def _build_group_cell(
        self,
        *,
        category: dict[str, Any],
        destination_country: str,
        group: Any,
        size_lookup: dict[str, Any],
    ) -> dict[str, Any]:
        size_entries = []
        market_segment = get_market_priority(destination_country)["segment"]
        category_id = category["category_id"]
        regional_multiplier = self._resolve_multiplier(destination_country, category_id)
        for slot_size_label in category["baseline_size_labels"]:
            size = size_lookup.get(slot_size_label)
            if size is None:
                size_entries.append(
                    {
                        "slot_size_label": slot_size_label,
                        "size_label": slot_size_label,
                        "available": False,
                        "sku": None,
                        "supplier_size_cm": None,
                        "supplier_size_inches": None,
                        "print_area": None,
                        "provider_attributes": {},
                        "source_country": None,
                        "currency": None,
                        "product_price": None,
                        "shipping_price": None,
                        "total_cost": None,
                        "delivery_days": None,
                        "default_shipping_tier": None,
                        "shipping_method": None,
                        "service_name": None,
                        "service_level": None,
                        "shipping_profiles": [],
                        "shipping_support": self.shipping_support_policy.evaluate_size([]),
                        "business_policy": self._serialize_business_decision(
                            self.business_policy.evaluate_print_business_rules(
                                category_id=category["category_id"],
                                market_segment=market_segment,
                                product_price=None,
                                shipping_support=None,
                                multiplier_override=regional_multiplier,
                            )
                        ),
                    }
                )
                continue

            shipping_profiles = size.shipping_profiles or []
            shipping_support = self.shipping_support_policy.evaluate_size(shipping_profiles)
            size_entry = {
                "id": getattr(size, "id", None),
                "slot_size_label": slot_size_label,
                "size_label": size.size_label or slot_size_label,
                "available": bool(size.available),
                "sku": getattr(size, "sku", None),
                "supplier_size_cm": getattr(size, "supplier_size_cm", None),
                "supplier_size_inches": getattr(size, "supplier_size_inches", None),
                "print_area": self._serialize_print_area(size),
                "provider_attributes": self._serialize_provider_attributes(size),
                "source_country": size.source_country,
                "currency": size.currency,
                "product_price": self._to_float(getattr(size, "product_price", None)),
                "shipping_price": self._to_float(getattr(size, "shipping_price", None)),
                "total_cost": self._to_float(size.total_cost),
                "delivery_days": size.delivery_days,
                "default_shipping_tier": size.default_shipping_tier,
                "shipping_method": size.shipping_method,
                "service_name": size.service_name,
                "service_level": size.service_level,
                "shipping_profiles": shipping_profiles,
                "shipping_support": shipping_support,
                "business_policy": self._serialize_business_decision(
                    self.business_policy.evaluate_print_business_rules(
                        category_id=category["category_id"],
                        market_segment=market_segment,
                        product_price=self._to_float(getattr(size, "product_price", None)),
                        shipping_support=shipping_support,
                        multiplier_override=regional_multiplier,
                    )
                ),
            }
            size_entries.append(size_entry)

        shipping_support = self.shipping_support_policy.summarize_group(size_entries)
        covered_prices = [
            float(item["shipping_support"]["chosen_shipping_price"])
            for item in size_entries
            if item.get("available")
            and item.get("shipping_support", {}).get("status") == "covered"
            and item.get("shipping_support", {}).get("chosen_shipping_price") is not None
        ]
        effective_source_context = self._build_effective_source_context(
            destination_country=destination_country,
            group_source_countries=list(group.source_countries or []),
            size_entries=size_entries,
        )
        business_summary = self._build_group_business_summary(
            category_id=category["category_id"],
            size_entries=size_entries,
        )

        return {
            "category_id": category["category_id"],
            "available": True,
            "storefront_action": group.storefront_action,
            "fulfillment_level": group.fulfillment_level,
            "geography_scope": group.geography_scope,
            "tax_risk": group.tax_risk,
            "effective_fulfillment_level": effective_source_context["fulfillment_level"],
            "effective_geography_scope": effective_source_context["geography_scope"],
            "effective_tax_risk": effective_source_context["tax_risk"],
            "source_mix": effective_source_context["source_mix"],
            "source_countries": list(group.source_countries or []),
            "fastest_delivery_days": group.fastest_delivery_days,
            "note": getattr(group, "note", None),
            "available_shipping_tiers": list(group.available_shipping_tiers or []),
            "default_shipping_tier": group.default_shipping_tier,
            "shipping_support": shipping_support,
            "business_summary": business_summary,
            "available_size_count": group.available_size_count,
            "price_range": {
                "currency": group.currency,
                "min_total": self._to_float(group.min_total_cost),
                "max_total": self._to_float(group.max_total_cost),
            },
            "fixed_attributes": group.fixed_attributes or {},
            "recommended_defaults": group.recommended_defaults or {},
            "allowed_attributes": group.allowed_attributes or {},
            "shipping_metrics": {
                "currency": group.currency,
                "avg_covered_shipping_price": self._avg(covered_prices),
                "median_covered_shipping_price": self._median(covered_prices),
            },
            "size_entries": size_entries,
        }

    def _build_missing_cell(self, *, category: dict[str, Any]) -> dict[str, Any]:
        return {
            "category_id": category["category_id"],
            "available": False,
            "storefront_action": "hide",
            "fulfillment_level": "unsupported",
            "geography_scope": "none",
            "tax_risk": "none",
            "source_countries": [],
            "fastest_delivery_days": None,
            "note": None,
            "available_shipping_tiers": [],
            "default_shipping_tier": None,
            "shipping_support": self.shipping_support_policy.summarize_group([]),
            "business_summary": self._build_group_business_summary(
                category_id=category["category_id"],
                size_entries=[],
            ),
            "effective_fulfillment_level": "unsupported",
            "effective_geography_scope": "none",
            "effective_tax_risk": "none",
            "source_mix": "none",
            "available_size_count": 0,
            "price_range": {
                "currency": None,
                "min_total": None,
                "max_total": None,
            },
            "fixed_attributes": category["fixed_attributes"],
            "recommended_defaults": category["recommended_defaults"],
            "allowed_attributes": category["allowed_attributes"],
            "shipping_metrics": {
                "currency": None,
                "avg_covered_shipping_price": None,
                "median_covered_shipping_price": None,
            },
            "size_entries": [
                {
                    "slot_size_label": slot_size_label,
                    "size_label": slot_size_label,
                    "available": False,
                    "sku": None,
                    "supplier_size_cm": None,
                    "supplier_size_inches": None,
                    "print_area": None,
                    "source_country": None,
                    "currency": None,
                    "product_price": None,
                    "shipping_price": None,
                    "total_cost": None,
                    "delivery_days": None,
                    "default_shipping_tier": None,
                    "shipping_method": None,
                    "service_name": None,
                    "service_level": None,
                    "shipping_profiles": [],
                    "shipping_support": self.shipping_support_policy.evaluate_size([]),
                    "business_policy": self._serialize_business_decision(
                        self.business_policy.evaluate_print_business_rules(
                            category_id=category["category_id"],
                            market_segment="long_tail",
                            product_price=None,
                            shipping_support=None,
                        )
                    ),
                }
                for slot_size_label in category["baseline_size_labels"]
            ],
        }

    def _build_country_shipping_summary(
        self,
        category_cells: list[dict[str, Any]],
    ) -> dict[str, Any]:
        category_summaries: list[dict[str, Any]] = []
        currency_buckets: dict[str, dict[str, Any]] = {}

        for cell in category_cells:
            metrics = cell.get("shipping_metrics") or {}
            currency = metrics.get("currency")
            avg_shipping_price = metrics.get("avg_covered_shipping_price")
            shipping_support = cell.get("shipping_support") or {}
            business_summary = cell.get("business_summary") or {}
            covered_size_count = shipping_support.get("covered_size_count", 0)
            available_size_count = cell.get("available_size_count", 0)
            category_summaries.append(
                {
                    "category_id": cell["category_id"],
                    "currency": currency,
                    "avg_covered_shipping_price": avg_shipping_price,
                    "median_covered_shipping_price": metrics.get("median_covered_shipping_price"),
                    "covered_size_count": covered_size_count,
                    "blocked_size_count": shipping_support.get("blocked_size_count", 0),
                    "available_size_count": available_size_count,
                    "shipping_mode": business_summary.get("default_shipping_mode"),
                    "included_size_count": business_summary.get("included_size_count", 0),
                    "pass_through_size_count": business_summary.get("pass_through_size_count", 0),
                    "hidden_size_count": business_summary.get("hidden_size_count", 0),
                }
            )

            if currency and avg_shipping_price is not None:
                bucket = currency_buckets.setdefault(
                    currency,
                    {
                        "currency": currency,
                        "prices": [],
                        "covered_category_count": 0,
                        "covered_size_count": 0,
                    },
                )
                bucket["prices"].append(float(avg_shipping_price))
                bucket["covered_category_count"] += 1
                bucket["covered_size_count"] += covered_size_count or available_size_count

        primary_bucket = self._select_primary_currency_bucket(currency_buckets)
        mixed_currency = len(currency_buckets) > 1
        primary_currency = primary_bucket["currency"] if primary_bucket else None
        all_prices = primary_bucket["prices"] if primary_bucket else []
        suggested_badge_cap = self._suggest_badge_cap(all_prices)

        covered_category_count = len(
            [
                item
                for item in category_summaries
                if item["currency"] == primary_currency
                and item["avg_covered_shipping_price"] is not None
            ]
        )

        return {
            "currency": primary_currency,
            "mixed_currency": mixed_currency,
            "avg_covered_shipping_price": self._avg(all_prices),
            "median_covered_shipping_price": self._median(all_prices),
            "suggested_badge_cap": suggested_badge_cap,
            "covered_category_count": covered_category_count,
            "category_summaries": category_summaries,
        }

    def _build_priority_market_summary(
        self,
        *,
        countries: list[dict[str, Any]],
        categories: list[dict[str, Any]],
    ) -> dict[str, Any]:
        category_labels = {item["category_id"]: item["label"] for item in categories}
        priority_countries = [
            country
            for country in countries
            if country["market_priority"]["segment"] in {"core", "focus"}
        ]

        focus_rows = []
        for country in priority_countries:
            shipping_summary = country["shipping_summary"]
            suggested_badge_cap = shipping_summary["suggested_badge_cap"]
            avg_shipping_price = shipping_summary["avg_covered_shipping_price"]
            market_segment = country["market_priority"]["segment"]
            entry_promo = country["entry_promo"]["overall"]
            paper_entry_promo = country["entry_promo"]["paper_print"]
            canvas_entry_promo = country["entry_promo"]["canvas"]

            focus_rows.append(
                {
                    "country_code": country["country_code"],
                    "country_name": country["country_name"],
                    "market_rank": country["market_priority"]["rank"],
                    "market_segment": market_segment,
                    "currency": shipping_summary["currency"],
                    "mixed_currency": shipping_summary["mixed_currency"],
                    "avg_covered_shipping_price": avg_shipping_price,
                    "median_covered_shipping_price": shipping_summary[
                        "median_covered_shipping_price"
                    ],
                    "suggested_badge_cap": suggested_badge_cap,
                    "entry_badge_eligible": entry_promo["eligible"],
                    "entry_badge_note": entry_promo["note"],
                    "paper_entry_badge_eligible": paper_entry_promo["eligible"],
                    "paper_entry_badge_note": paper_entry_promo["note"],
                    "canvas_entry_badge_eligible": canvas_entry_promo["eligible"],
                    "canvas_entry_badge_note": canvas_entry_promo["note"],
                    "covered_category_count": shipping_summary["covered_category_count"],
                    "category_summaries": [
                        {
                            **item,
                            "category_label": category_labels.get(
                                item["category_id"], item["category_id"]
                            ),
                        }
                        for item in shipping_summary["category_summaries"]
                    ],
                }
            )

        return {
            "strategy_note": (
                "Countries are ordered by storefront commercial priority. "
                "Entry badge eligibility now follows the simple model: "
                "free delivery on unframed prints only."
            ),
            "focus_countries": focus_rows,
        }

    def _build_group_business_summary(
        self,
        *,
        category_id: str,
        size_entries: list[dict[str, Any]],
    ) -> dict[str, Any]:
        available_entries = [item for item in size_entries if item.get("available")]
        mode_counts = {
            "included": 0,
            "pass_through": 0,
            "hide": 0,
        }
        for item in available_entries:
            decision = item.get("business_policy") or {}
            mode = decision.get("shipping_mode")
            if mode in mode_counts:
                mode_counts[mode] += 1

        default_mode = "hide"
        if (
            mode_counts["included"] > 0
            and mode_counts["pass_through"] == 0
            and mode_counts["hide"] == 0
        ):
            default_mode = "included"
        elif mode_counts["included"] > 0 or mode_counts["pass_through"] > 0:
            default_mode = "pass_through"

        return {
            "policy_family": (
                "unframed_free_delivery"
                if self.business_policy.is_unframed_free_delivery_category(category_id)
                else "shipping_at_checkout"
            ),
            "default_shipping_mode": default_mode,
            "included_size_count": mode_counts["included"],
            "pass_through_size_count": mode_counts["pass_through"],
            "hidden_size_count": mode_counts["hide"],
            "available_size_count": len(available_entries),
        }

    def _build_country_entry_promo(
        self,
        category_cells: list[dict[str, Any]],
    ) -> dict[str, Any]:
        category_summaries = {
            item["category_id"]: item.get("business_summary") or {} for item in category_cells
        }
        return self.business_policy.evaluate_country_entry_promos(category_summaries)

    def _build_entry_promo_summary(
        self,
        countries: list[dict[str, Any]],
    ) -> dict[str, Any]:
        overall_eligible = [
            country for country in countries if country["entry_promo"]["overall"]["eligible"]
        ]
        overall_ineligible = [
            country for country in countries if not country["entry_promo"]["overall"]["eligible"]
        ]
        paper_eligible = [
            country for country in countries if country["entry_promo"]["paper_print"]["eligible"]
        ]
        canvas_eligible = [
            country for country in countries if country["entry_promo"]["canvas"]["eligible"]
        ]
        return {
            "eligible_country_count": len(overall_eligible),
            "ineligible_country_count": len(overall_ineligible),
            "eligible_country_codes": [country["country_code"] for country in overall_eligible],
            "paper_eligible_country_count": len(paper_eligible),
            "canvas_eligible_country_count": len(canvas_eligible),
            "paper_eligible_country_codes": [country["country_code"] for country in paper_eligible],
            "canvas_eligible_country_codes": [
                country["country_code"] for country in canvas_eligible
            ],
        }

    def _sort_ratio_rows(
        self,
        ratio_rows: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        preview_defaults = {item["label"]: item["sort_order"] for item in DEFAULT_RATIO_PRESETS}
        return sorted(
            ratio_rows,
            key=lambda item: (
                preview_defaults.get(item["ratio_label"], 999),
                item["ratio_label"],
            ),
        )

    def _serialize_bake(self, bake: Any) -> dict[str, Any]:
        return {
            "id": bake.id,
            "bake_key": bake.bake_key,
            "paper_material": bake.paper_material,
            "include_notice_level": bake.include_notice_level,
            "status": bake.status,
            "ratio_count": bake.ratio_count,
            "country_count": bake.country_count,
            "offer_group_count": bake.offer_group_count,
            "offer_size_count": bake.offer_size_count,
            "created_at": bake.created_at.isoformat() if bake.created_at else None,
        }

    def _size_sort_key(self, label: str) -> tuple[float, float, str]:
        normalized = label.lower().replace("cm", "").replace('"', "").strip()
        if "x" not in normalized:
            return (9999.0, 9999.0, label)
        left, right = normalized.split("x", 1)
        try:
            return (float(left.strip()), float(right.strip()), label)
        except ValueError:
            return (9999.0, 9999.0, label)

    def _to_float(self, value: Decimal | None) -> float | None:
        if value is None:
            return None
        return round(float(value), 2)

    def _serialize_print_area(self, size: Any) -> dict[str, Any] | None:
        width = getattr(size, "print_area_width_px", None)
        height = getattr(size, "print_area_height_px", None)
        if width is None or height is None:
            return None
        return {
            "width_px": int(width),
            "height_px": int(height),
            "name": getattr(size, "print_area_name", None) or "default",
            "source": getattr(size, "print_area_source", None),
            "dimensions": getattr(size, "print_area_dimensions", None) or {},
        }

    def _serialize_provider_attributes(self, size: Any) -> dict[str, Any]:
        dimensions = getattr(size, "print_area_dimensions", None) or {}
        if isinstance(dimensions, str):
            try:
                dimensions = json.loads(dimensions)
            except json.JSONDecodeError:
                return {}
        if not isinstance(dimensions, dict):
            return {}
        attributes = dimensions.get("variant_attributes") or {}
        return dict(attributes) if isinstance(attributes, dict) else {}

    def _serialize_business_decision(self, decision: dict[str, Any]) -> dict[str, Any]:
        return {
            **decision,
            "retail_product_price": self._to_float(decision.get("retail_product_price")),
            "customer_shipping_price": self._to_float(decision.get("customer_shipping_price")),
            "shipping_price_for_margin": self._to_float(decision.get("shipping_price_for_margin")),
            "shipping_reference_price": self._to_float(decision.get("shipping_reference_price")),
            "shipping_credit_applied": self._to_float(decision.get("shipping_credit_applied")),
        }

    def _serialize_business_policy_meta(self) -> dict[str, Any]:
        return {
            "free_delivery_categories": [],
            "entry_badge_category_groups": {
                key: list(value)
                for key, value in self.business_policy.ENTRY_BADGE_CATEGORY_GROUPS.items()
            },
            "print_shipping_at_checkout_categories": sorted(
                self.business_policy.PRINT_SHIPPING_AT_CHECKOUT_CATEGORIES
            ),
            "print_delivery_subsidy_budget": self.business_policy.PRINT_DELIVERY_SUBSIDY_BUDGET,
            "policy_note": (
                "Prodigi print shipping is charged at checkout. Free delivery applies only "
                "to original-art orders."
            ),
        }

    def _select_primary_currency_bucket(
        self,
        currency_buckets: dict[str, dict[str, Any]],
    ) -> dict[str, Any] | None:
        if not currency_buckets:
            return None
        return max(
            currency_buckets.values(),
            key=lambda item: (
                item["covered_category_count"],
                item["covered_size_count"],
                -self._avg(item["prices"]) if self._avg(item["prices"]) is not None else -999999,
                item["currency"],
            ),
        )

    def _build_effective_source_context(
        self,
        *,
        destination_country: str,
        group_source_countries: list[str],
        size_entries: list[dict[str, Any]],
    ) -> dict[str, str]:
        available_sources = {
            str(item.get("source_country") or "").upper()
            for item in size_entries
            if item.get("available") and item.get("source_country")
        }
        if not available_sources:
            available_sources = {
                str(source or "").upper() for source in group_source_countries if source
            }
        if not available_sources:
            return {
                "fulfillment_level": "unsupported",
                "geography_scope": "none",
                "tax_risk": "none",
                "source_mix": "none",
            }

        destination_country = destination_country.upper()
        local_sources = {source for source in available_sources if source == destination_country}
        regional_sources = {
            source
            for source in available_sources
            if source != destination_country
            and destination_country in EUROPE_COUNTRY_CODES
            and source in EUROPE_COUNTRY_CODES
        }
        cross_border_sources = available_sources - local_sources - regional_sources

        active_modes = sum(
            1 for bucket in (local_sources, regional_sources, cross_border_sources) if bucket
        )

        if active_modes > 1:
            fulfillment_level = "mixed"
            geography_scope = "mixed"
            tax_risk = "elevated" if cross_border_sources else "low"
            source_mix = "mixed"
        elif local_sources:
            fulfillment_level = "local"
            geography_scope = "domestic"
            tax_risk = "low"
            source_mix = "local_only"
        elif regional_sources:
            fulfillment_level = "regional"
            geography_scope = "europe"
            tax_risk = "low"
            source_mix = "regional_only"
        else:
            fulfillment_level = "cross_border"
            geography_scope = "international"
            tax_risk = "elevated"
            source_mix = "cross_border_only"

        return {
            "fulfillment_level": fulfillment_level,
            "geography_scope": geography_scope,
            "tax_risk": tax_risk,
            "source_mix": source_mix,
        }

    def _avg(self, values: list[float]) -> float | None:
        if not values:
            return None
        return round(sum(values) / len(values), 2)

    def _median(self, values: list[float]) -> float | None:
        if not values:
            return None
        ordered = sorted(values)
        mid = len(ordered) // 2
        if len(ordered) % 2:
            return round(ordered[mid], 2)
        return round((ordered[mid - 1] + ordered[mid]) / 2, 2)

    def _suggest_badge_cap(self, values: list[float]) -> float | None:
        if not values:
            return None
        ordered = sorted(values)
        index = min(len(ordered) - 1, max(0, round((len(ordered) - 1) * 0.75)))
        candidate = ordered[index]
        capped = min(candidate, self.shipping_support_policy.FREE_SHIPPING_COVERED_CAP)
        return round(capped, 2)
