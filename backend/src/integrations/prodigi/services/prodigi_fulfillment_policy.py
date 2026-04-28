from __future__ import annotations

from collections import defaultdict
from typing import Any

EU_COUNTRY_CODES = {
    "AT",
    "BE",
    "BG",
    "HR",
    "CY",
    "CZ",
    "DK",
    "EE",
    "FI",
    "FR",
    "DE",
    "GR",
    "HU",
    "IE",
    "IT",
    "LV",
    "LT",
    "LU",
    "MT",
    "NL",
    "PL",
    "PT",
    "RO",
    "SK",
    "SI",
    "ES",
    "SE",
}

EUROPE_COUNTRY_CODES = EU_COUNTRY_CODES | {
    "CH",
    "GB",
    "IS",
    "LI",
    "NO",
}


class ProdigiFulfillmentPolicyService:
    """
    Pure policy layer that classifies operational fulfillment risk by
    ratio/country/category after storefront-safe supplier rows are selected.

    This is intentionally separate from:
    - repository reads,
    - storefront attribute filtering,
    - preview rendering.
    """

    def build(
        self,
        rows: list[dict[str, Any]],
        selector: Any,
    ) -> dict[str, Any]:
        buckets: dict[str, dict[str, dict[str, dict[str, Any]]]] = defaultdict(
            lambda: defaultdict(
                lambda: defaultdict(
                    lambda: {
                        "source_countries": set(),
                        "row_count": 0,
                        "fastest_min_shipping_days": None,
                        "fastest_max_shipping_days": None,
                    }
                )
            )
        )

        for row in rows:
            category_id = row.get("category_id")
            if not category_id:
                continue

            matched_ratio = selector.match_ratio(row.get("size_cm"), row.get("size_inches"))
            if not matched_ratio:
                continue

            destination_country = (row.get("destination_country") or "").upper()
            if not destination_country:
                continue

            bucket = buckets[matched_ratio][destination_country][category_id]
            bucket["row_count"] += 1

            source_country = (row.get("source_country") or "").upper()
            if source_country:
                bucket["source_countries"].add(source_country)

            bucket["fastest_min_shipping_days"] = self._min_or_current(
                bucket["fastest_min_shipping_days"],
                row.get("min_shipping_days"),
            )
            bucket["fastest_max_shipping_days"] = self._min_or_current(
                bucket["fastest_max_shipping_days"],
                row.get("max_shipping_days"),
            )

        by_ratio: dict[str, dict[str, dict[str, Any]]] = {}
        for ratio, ratio_countries in buckets.items():
            by_ratio[ratio] = {}
            for destination_country, categories in ratio_countries.items():
                by_ratio[ratio][destination_country] = {
                    category_id: self._build_country_category_summary(
                        destination_country=destination_country,
                        source_countries=payload["source_countries"],
                        row_count=payload["row_count"],
                        fastest_min_shipping_days=payload["fastest_min_shipping_days"],
                        fastest_max_shipping_days=payload["fastest_max_shipping_days"],
                    )
                    for category_id, payload in categories.items()
                }

        return {"by_ratio": by_ratio}

    def build_empty_country_category_summary(self, destination_country: str) -> dict[str, Any]:
        return {
            "fulfillment_level": "unsupported",
            "geography_scope": "none",
            "storefront_action": "hide",
            "source_countries": [],
            "tax_risk": "none",
            "row_count": 0,
            "fastest_delivery_days": None,
            "note": (
                f"No curated supplier route is available for {destination_country} "
                "under the current filters."
            ),
        }

    def summarize_category(
        self,
        country_summaries: list[dict[str, Any]],
    ) -> dict[str, int]:
        summary = {
            "local_country_count": 0,
            "regional_country_count": 0,
            "cross_border_country_count": 0,
            "unsupported_country_count": 0,
            "domestic_geography_country_count": 0,
            "europe_geography_country_count": 0,
            "international_geography_country_count": 0,
            "no_geography_country_count": 0,
            "low_tax_country_count": 0,
            "elevated_tax_country_count": 0,
            "no_tax_country_count": 0,
            "show_country_count": 0,
            "notice_country_count": 0,
            "hidden_country_count": 0,
        }

        for item in country_summaries:
            level = item["fulfillment_level"]
            geography_scope = item["geography_scope"]
            tax_risk = item["tax_risk"]
            action = item["storefront_action"]

            if level == "local":
                summary["local_country_count"] += 1
            elif level == "regional":
                summary["regional_country_count"] += 1
            elif level == "cross_border":
                summary["cross_border_country_count"] += 1
            else:
                summary["unsupported_country_count"] += 1

            if geography_scope == "domestic":
                summary["domestic_geography_country_count"] += 1
            elif geography_scope == "europe":
                summary["europe_geography_country_count"] += 1
            elif geography_scope == "international":
                summary["international_geography_country_count"] += 1
            else:
                summary["no_geography_country_count"] += 1

            if tax_risk == "low":
                summary["low_tax_country_count"] += 1
            elif tax_risk == "elevated":
                summary["elevated_tax_country_count"] += 1
            else:
                summary["no_tax_country_count"] += 1

            if action == "show":
                summary["show_country_count"] += 1
            elif action == "show_with_notice":
                summary["notice_country_count"] += 1
            else:
                summary["hidden_country_count"] += 1

        return summary

    def _build_country_category_summary(
        self,
        destination_country: str,
        source_countries: set[str],
        row_count: int,
        fastest_min_shipping_days: int | None,
        fastest_max_shipping_days: int | None,
    ) -> dict[str, Any]:
        if not source_countries:
            return self.build_empty_country_category_summary(destination_country)

        sorted_sources = sorted(source_countries)
        fastest_delivery_days = self._format_delivery_days(
            fastest_min_shipping_days,
            fastest_max_shipping_days,
        )

        if destination_country in source_countries:
            return {
                "fulfillment_level": "local",
                "geography_scope": "domestic",
                "storefront_action": "show",
                "source_countries": sorted_sources,
                "tax_risk": "low",
                "row_count": row_count,
                "fastest_delivery_days": fastest_delivery_days,
                "note": (
                    "Local production exists for this country, so this is the safest "
                    "default storefront path."
                ),
            }

        if destination_country in EU_COUNTRY_CODES and source_countries & EU_COUNTRY_CODES:
            return {
                "fulfillment_level": "regional",
                "geography_scope": "europe",
                "storefront_action": "show",
                "source_countries": sorted_sources,
                "tax_risk": "low",
                "row_count": row_count,
                "fastest_delivery_days": fastest_delivery_days,
                "note": (
                    "An EU regional source exists for this country. That is a reasonable "
                    "primary storefront path before we model landed cost in detail."
                ),
            }

        geography_scope = self._resolve_geography_scope(
            destination_country=destination_country,
            source_countries=source_countries,
        )
        source_note = self._build_cross_border_source_note(sorted_sources)
        return {
            "fulfillment_level": "cross_border",
            "geography_scope": geography_scope,
            "storefront_action": "show_with_notice",
            "source_countries": sorted_sources,
            "tax_risk": "elevated",
            "row_count": row_count,
            "fastest_delivery_days": fastest_delivery_days,
            "note": (
                f"{source_note} Delivery can still be shown, but customs or taxes may apply."
            ),
        }

    def _build_cross_border_source_note(self, sorted_sources: list[str]) -> str:
        if len(sorted_sources) == 1:
            return f"Only {sorted_sources[0]} is available as a source for this category."
        return (
            "Only cross-border supplier sources are available for this category "
            f"({', '.join(sorted_sources)})."
        )

    def _resolve_geography_scope(
        self,
        destination_country: str,
        source_countries: set[str],
    ) -> str:
        if destination_country in source_countries:
            return "domestic"
        if (
            destination_country in EUROPE_COUNTRY_CODES
            and source_countries & EUROPE_COUNTRY_CODES
        ):
            return "europe"
        return "international"

    def _format_delivery_days(self, min_days: int | None, max_days: int | None) -> str | None:
        if min_days is None and max_days is None:
            return None
        if min_days == max_days:
            return f"{min_days} days"
        if min_days is None:
            return f"up to {max_days} days"
        if max_days is None:
            return f"{min_days}+ days"
        return f"{min_days}-{max_days} days"

    def _min_or_current(self, current: int | None, candidate: Any) -> int | None:
        if candidate is None:
            return current
        candidate_int = int(candidate)
        if current is None:
            return candidate_int
        return min(current, candidate_int)
