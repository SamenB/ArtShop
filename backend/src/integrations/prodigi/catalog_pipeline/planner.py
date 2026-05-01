from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass
from typing import Any

from src.integrations.prodigi.catalog_pipeline.parser import ProdigiCsvRowParser
from src.integrations.prodigi.catalog_pipeline.source import ProdigiCsvSource
from src.services.artwork_print_profiles import (
    CANVAS_WRAP_OPTIONS,
    WRAPPED_CANVAS_CATEGORIES,
)


@dataclass(slots=True)
class ProdigiCatalogSnapshotPlan:
    ratio_category_size_stats: dict[str, Any]
    country_size_presence: dict[str, Any]
    country_names: dict[str, Any]
    fulfillment_buckets: dict[str, Any]
    offers_by_slot: dict[str, Any]
    kept_by_category: Counter
    removed_by_category: Counter
    matched_row_count: int
    files_seen: int
    rows_seen: int
    preview_rows: list[dict[str, Any]] | None = None


class ProdigiCatalogSnapshotPlanner:
    """
    Turns raw parsed CSV rows into the in-memory plan used by the bake writer.

    This is the policy/planning layer: no database writes and no HTTP calls.
    """

    def __init__(
        self,
        *,
        category_defs: list[dict[str, Any]],
        selector: Any,
        preview_service: Any,
        storefront_policy: Any,
        fulfillment_policy: Any,
        shipping_policy: Any,
        parser: ProdigiCsvRowParser | None = None,
    ):
        self.category_defs = category_defs
        self.selector = selector
        self.preview_service = preview_service
        self.storefront_policy = storefront_policy
        self.fulfillment_policy = fulfillment_policy
        self.shipping_policy = shipping_policy
        self.parser = parser or ProdigiCsvRowParser()
        self._category_ids = {category["id"] for category in category_defs}

    def build_plan(
        self,
        source: ProdigiCsvSource,
        *,
        collect_preview_rows: bool = False,
    ) -> ProdigiCatalogSnapshotPlan:
        ratio_category_size_stats: dict[str, Any] = defaultdict(
            lambda: defaultdict(lambda: defaultdict(lambda: {"rows": 0, "countries": set()}))
        )
        country_size_presence: dict[str, Any] = defaultdict(
            lambda: defaultdict(lambda: defaultdict(set))
        )
        country_names: dict[str, dict[str, str]] = defaultdict(dict)
        fulfillment_buckets: dict[str, Any] = defaultdict(
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
        offers_by_slot: dict[str, Any] = defaultdict(
            lambda: defaultdict(lambda: defaultdict(lambda: defaultdict(dict)))
        )
        canvas_wraps_by_slot: dict[str, Any] = defaultdict(
            lambda: defaultdict(lambda: defaultdict(lambda: defaultdict(set)))
        )
        kept_by_category: Counter = Counter()
        removed_by_category: Counter = Counter()
        matched_row_count = 0
        files_seen = len(source.discover_csv_files())
        rows_seen = 0
        preview_rows: list[dict[str, Any]] | None = [] if collect_preview_rows else None

        for record in source.iter_records():
            rows_seen += 1
            parsed = self.parser.parse(record.file_path, record.row)
            if not parsed or not parsed["is_relevant_for_artshop"]:
                continue

            ratio = self.selector.match_ratio(
                parsed.get("size_cm"),
                parsed.get("size_inches"),
            )
            dims = self.selector.parse_size_dims(
                parsed.get("size_cm"),
                parsed.get("size_inches"),
            )
            if ratio is None or dims is None:
                continue

            category_id = self.resolve_category_id(parsed)
            if category_id is None:
                continue

            parsed["category_id"] = category_id
            if not self.storefront_policy._matches_policy(category_id, parsed):
                removed_by_category[category_id] += 1
                continue

            destination_country = (parsed.get("destination_country") or "").upper()
            if not destination_country:
                continue

            kept_by_category[category_id] += 1
            matched_row_count += 1
            if preview_rows is not None:
                preview_rows.append(dict(parsed))
            ratio_category_size_stats[ratio][category_id][dims]["rows"] += 1
            ratio_category_size_stats[ratio][category_id][dims]["countries"].add(
                destination_country
            )
            country_size_presence[ratio][destination_country][category_id].add(dims)
            self.preview_service._remember_country_name(
                country_names[ratio],
                destination_country,
                parsed.get("destination_country_name"),
            )

            bucket = fulfillment_buckets[ratio][destination_country][category_id]
            bucket["row_count"] += 1
            source_country = (parsed.get("source_country") or "").upper()
            if source_country:
                bucket["source_countries"].add(source_country)
            bucket["fastest_min_shipping_days"] = self.fulfillment_policy._min_or_current(
                bucket["fastest_min_shipping_days"],
                parsed.get("min_shipping_days"),
            )
            bucket["fastest_max_shipping_days"] = self.fulfillment_policy._min_or_current(
                bucket["fastest_max_shipping_days"],
                parsed.get("max_shipping_days"),
            )

            offer = self.build_offer(parsed)
            wrap = str(parsed.get("wrap") or "").strip()
            if category_id in WRAPPED_CANVAS_CATEGORIES and wrap:
                canvas_wraps_by_slot[ratio][destination_country][category_id][
                    dims.label
                ].add(wrap)
            tier = self.shipping_policy.normalize_tier(
                offer.get("shipping_method"),
                offer.get("service_level"),
            )
            existing = offers_by_slot[ratio][destination_country][category_id][dims.label].get(
                tier
            )
            if existing is None or self.shipping_policy._offer_rank(
                offer,
                destination_country,
            ) < self.shipping_policy._offer_rank(existing, destination_country):
                offers_by_slot[ratio][destination_country][category_id][dims.label][tier] = offer

        self._prune_incomplete_canvas_wrap_slots(
            country_size_presence=country_size_presence,
            offers_by_slot=offers_by_slot,
            canvas_wraps_by_slot=canvas_wraps_by_slot,
        )

        return ProdigiCatalogSnapshotPlan(
            ratio_category_size_stats=ratio_category_size_stats,
            country_size_presence=country_size_presence,
            country_names=country_names,
            fulfillment_buckets=fulfillment_buckets,
            offers_by_slot=offers_by_slot,
            kept_by_category=kept_by_category,
            removed_by_category=removed_by_category,
            matched_row_count=matched_row_count,
            files_seen=files_seen,
            rows_seen=rows_seen,
            preview_rows=preview_rows,
        )

    def resolve_category_id(self, parsed: dict[str, Any]) -> str | None:
        curated_category_id = parsed.get("category_id")
        if curated_category_id in self._category_ids:
            return curated_category_id
        return self.match_category_id(parsed)

    def match_category_id(self, parsed: dict[str, Any]) -> str | None:
        sku = (parsed.get("sku") or "").upper()
        description = (parsed.get("product_description") or "").upper()

        for category in self.category_defs:
            if parsed.get("normalized_medium") != category["medium"]:
                continue
            if parsed.get("normalized_material") != category["material"]:
                continue
            if parsed.get("normalized_presentation") not in category["presentation_values"]:
                continue
            if parsed.get("normalized_frame_type") not in category["frame_type_values"]:
                continue
            if any(pattern.upper() in sku for pattern in category.get("exclude_sku_patterns", ())):
                continue
            if any(
                pattern.upper() in description
                for pattern in category.get("exclude_description_patterns", ())
            ):
                continue
            if any(
                pattern.upper() not in sku for pattern in category.get("include_sku_patterns", ())
            ):
                continue
            if any(
                pattern.upper() not in description
                for pattern in category.get("include_description_patterns", ())
            ):
                continue
            return category["id"]

        return None

    def build_offer(self, parsed: dict[str, Any]) -> dict[str, Any]:
        product_price = self._to_float(parsed.get("product_price"))
        shipping_price = self._to_float(parsed.get("shipping_price"))
        source_country = (parsed.get("source_country") or "").upper()
        destination_country = (parsed.get("destination_country") or "").upper()
        return {
            "sku": parsed["sku"],
            "variant_key": parsed.get("variant_key"),
            "size_cm": parsed.get("size_cm"),
            "size_inches": parsed.get("size_inches"),
            "source_country": source_country or None,
            "destination_country": destination_country or None,
            "destination_country_name": parsed.get("destination_country_name")
            or destination_country,
            "product_price": product_price,
            "shipping_price": shipping_price,
            "total_cost": round(product_price + shipping_price, 2),
            "currency": parsed.get("product_currency")
            or parsed.get("shipping_currency")
            or "EUR",
            "delivery_days": self.preview_service._format_delivery_days(
                parsed.get("min_shipping_days"),
                parsed.get("max_shipping_days"),
            ),
            "shipping_method": parsed.get("shipping_method"),
            "service_name": parsed.get("service_name"),
            "service_level": parsed.get("service_level"),
            "min_shipping_days": parsed.get("min_shipping_days"),
            "max_shipping_days": parsed.get("max_shipping_days"),
        }

    def _prune_incomplete_canvas_wrap_slots(
        self,
        *,
        country_size_presence: dict[str, Any],
        offers_by_slot: dict[str, Any],
        canvas_wraps_by_slot: dict[str, Any],
    ) -> None:
        all_required_wraps = set(CANVAS_WRAP_OPTIONS)
        required_wraps_by_category = {
            category["id"]: {category["recommended_defaults"]["wrap"]}
            for category in self.category_defs
            if category["id"] in WRAPPED_CANVAS_CATEGORIES
            and (category.get("recommended_defaults") or {}).get("wrap")
        }
        for ratio, country_map in canvas_wraps_by_slot.items():
            for country_code, category_map in country_map.items():
                for category_id, size_map in category_map.items():
                    required_wraps = required_wraps_by_category.get(
                        category_id,
                        all_required_wraps,
                    )
                    blocked_labels = {
                        size_label
                        for size_label, wraps in size_map.items()
                        if not required_wraps.issubset(set(wraps))
                    }
                    if not blocked_labels:
                        continue

                    presence = country_size_presence.get(ratio, {}).get(country_code, {}).get(
                        category_id
                    )
                    if presence:
                        country_size_presence[ratio][country_code][category_id] = {
                            dims
                            for dims in presence
                            if getattr(dims, "label", None) not in blocked_labels
                        }

                    slot_offers = (
                        offers_by_slot.get(ratio, {}).get(country_code, {}).get(category_id, {})
                    )
                    for size_label in blocked_labels:
                        slot_offers.pop(size_label, None)

    def _to_float(self, value: Any) -> float:
        if value is None:
            return 0.0
        return round(float(value), 2)
