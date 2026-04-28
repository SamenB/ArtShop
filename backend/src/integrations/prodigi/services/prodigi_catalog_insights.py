from __future__ import annotations

from collections import defaultdict
from statistics import median
from typing import Any

ATTRIBUTE_FIELDS = (
    "frame",
    "color",
    "style",
    "glaze",
    "mount",
    "mount_color",
    "paper_type",
    "wrap",
    "edge",
)


class ProdigiCatalogInsightsService:
    """
    Pure business-logic service for summarizing supplier option coverage.

    This sits alongside preview logic and helps us answer questions like:
    - which frame colors have full coverage,
    - whether acrylic/glass variants are both broadly available,
    - what shipping methods actually exist by category/source.
    """

    def build_category_report(self, rows: list[dict[str, Any]]) -> dict[str, Any]:
        by_category: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for row in rows:
            category_id = row.get("category_id")
            if category_id:
                by_category[category_id].append(row)

        categories = [
            self._build_single_category_report(category_id, category_rows)
            for category_id, category_rows in sorted(by_category.items())
        ]
        return {
            "category_count": len(categories),
            "categories": categories,
        }

    def _build_single_category_report(
        self,
        category_id: str,
        rows: list[dict[str, Any]],
    ) -> dict[str, Any]:
        countries = {
            (row.get("destination_country") or "").upper()
            for row in rows
            if row.get("destination_country")
        }
        source_countries = {
            (row.get("source_country") or "").upper()
            for row in rows
            if row.get("source_country")
        }
        variant_ids = {row.get("variant_id") for row in rows if row.get("variant_id") is not None}

        attribute_summaries = {
            field: self._summarize_attribute_field(field, rows)
            for field in ATTRIBUTE_FIELDS
        }
        shipping_summary = self._summarize_shipping(rows)

        return {
            "category_id": category_id,
            "row_count": len(rows),
            "variant_count": len(variant_ids),
            "country_count": len(countries),
            "source_countries": sorted(source_countries),
            "attributes": attribute_summaries,
            "shipping_methods": shipping_summary,
        }

    def _summarize_attribute_field(
        self,
        field_name: str,
        rows: list[dict[str, Any]],
    ) -> dict[str, Any]:
        buckets: dict[str, dict[str, Any]] = defaultdict(
            lambda: {"row_count": 0, "countries": set(), "source_countries": set()}
        )

        for row in rows:
            raw_value = row.get(field_name)
            if raw_value is None:
                continue
            value = str(raw_value).strip()
            if not value:
                continue

            bucket = buckets[value]
            bucket["row_count"] += 1

            destination_country = (row.get("destination_country") or "").upper()
            if destination_country:
                bucket["countries"].add(destination_country)

            source_country = (row.get("source_country") or "").upper()
            if source_country:
                bucket["source_countries"].add(source_country)

        values = [
            {
                "value": value,
                "row_count": bucket["row_count"],
                "country_count": len(bucket["countries"]),
                "source_countries": sorted(bucket["source_countries"]),
            }
            for value, bucket in buckets.items()
        ]
        values.sort(
            key=lambda item: (
                -item["country_count"],
                -item["row_count"],
                item["value"],
            )
        )

        return {
            "field": field_name,
            "value_count": len(values),
            "values": values,
        }

    def _summarize_shipping(self, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        buckets: dict[tuple[str, str, str, str], dict[str, Any]] = defaultdict(
            lambda: {
                "row_count": 0,
                "source_countries": set(),
                "shipping_prices": [],
                "product_prices": [],
                "min_days": [],
                "max_days": [],
            }
        )

        for row in rows:
            key = (
                str(row.get("shipping_method") or "").strip() or "UNKNOWN",
                str(row.get("service_name") or "").strip(),
                str(row.get("service_level") or "").strip(),
                str(row.get("tracked_shipping") or "").strip(),
            )
            bucket = buckets[key]
            bucket["row_count"] += 1

            source_country = (row.get("source_country") or "").upper()
            if source_country:
                bucket["source_countries"].add(source_country)

            if row.get("shipping_price") is not None:
                bucket["shipping_prices"].append(float(row["shipping_price"]))
            if row.get("product_price") is not None:
                bucket["product_prices"].append(float(row["product_price"]))
            if row.get("min_shipping_days") is not None:
                bucket["min_days"].append(int(row["min_shipping_days"]))
            if row.get("max_shipping_days") is not None:
                bucket["max_days"].append(int(row["max_shipping_days"]))

        results = []
        for (shipping_method, service_name, service_level, tracked_shipping), bucket in buckets.items():
            results.append(
                {
                    "shipping_method": shipping_method,
                    "service_name": service_name or None,
                    "service_level": service_level or None,
                    "tracked_shipping": tracked_shipping or None,
                    "row_count": bucket["row_count"],
                    "source_countries": sorted(bucket["source_countries"]),
                    "median_shipping_price": (
                        round(median(bucket["shipping_prices"]), 2)
                        if bucket["shipping_prices"]
                        else None
                    ),
                    "median_product_price": (
                        round(median(bucket["product_prices"]), 2)
                        if bucket["product_prices"]
                        else None
                    ),
                    "median_min_shipping_days": (
                        median(bucket["min_days"]) if bucket["min_days"] else None
                    ),
                    "median_max_shipping_days": (
                        median(bucket["max_days"]) if bucket["max_days"] else None
                    ),
                }
            )

        results.sort(
            key=lambda item: (
                -item["row_count"],
                item["shipping_method"],
                item["service_name"] or "",
            )
        )
        return results
