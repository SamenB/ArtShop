from __future__ import annotations

import csv
from collections import Counter, defaultdict
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import update

from src.integrations.prodigi.services.prodigi_artwork_storefront_materializer import (
    ProdigiArtworkStorefrontMaterializerService,
)
from src.integrations.prodigi.services.prodigi_catalog_preview import (
    DEFAULT_PAPER_MATERIAL,
    DEFAULT_RATIO_PRESETS,
    ProdigiCatalogPreviewService,
)
from src.integrations.prodigi.services.prodigi_csv_import import ProdigiCsvImportService
from src.integrations.prodigi.services.prodigi_fulfillment_policy import (
    ProdigiFulfillmentPolicyService,
)
from src.integrations.prodigi.services.prodigi_print_area_resolver import ProdigiPrintAreaResolver
from src.integrations.prodigi.services.prodigi_shipping_policy import ProdigiShippingPolicyService
from src.integrations.prodigi.services.prodigi_storefront_bake import ProdigiStorefrontBakeService
from src.integrations.prodigi.services.prodigi_storefront_policy import (
    ProdigiStorefrontPolicyService,
)
from src.integrations.prodigi.services.sizing.selector import ProdigiSizeSelectorService
from src.models.prodigi_storefront import (
    ProdigiStorefrontBakeOrm,
    ProdigiStorefrontOfferGroupOrm,
    ProdigiStorefrontOfferSizeOrm,
)
from src.services.artwork_print_profiles import (
    CANVAS_WRAP_OPTIONS,
    WRAPPED_CANVAS_CATEGORIES,
)


class ProdigiCsvStorefrontRebuildService:
    """
    Offline storefront rebuild that streams local Prodigi CSV files directly into
    baked storefront tables.

    This avoids loading multi-million raw route rows into Python memory and skips
    the legacy raw-catalog database layer when we only need the final baked
    storefront for the website.
    """

    def __init__(self, db, csv_root: Path | None = None):
        self.db = db
        self.csv_import = ProdigiCsvImportService(csv_root=csv_root)
        self.preview_service = ProdigiCatalogPreviewService(db)
        self.storefront_policy = ProdigiStorefrontPolicyService()
        self.fulfillment_policy = ProdigiFulfillmentPolicyService()
        self.shipping_policy = ProdigiShippingPolicyService()
        self.bake_service = ProdigiStorefrontBakeService(db)

    async def rebuild(
        self,
        *,
        selected_ratio: str | None = None,
        selected_country: str | None = None,
        selected_paper_material: str | None = None,
        include_notice_level: bool = True,
    ) -> dict[str, Any]:
        paper_material = selected_paper_material or DEFAULT_PAPER_MATERIAL
        ratio_presets = await self.preview_service._get_ratio_presets()
        if not ratio_presets:
            ratio_presets = list(DEFAULT_RATIO_PRESETS)
        selector = ProdigiSizeSelectorService(
            ratio_labels=[item["label"] for item in ratio_presets]
        )
        category_defs = self.preview_service.get_category_defs(paper_material)

        (
            ratio_category_size_stats,
            country_size_presence,
            country_names,
            fulfillment_buckets,
            offers_by_slot,
            kept_by_category,
            removed_by_category,
            matched_row_count,
        ) = self._stream_csv_rows(category_defs=category_defs, selector=selector)

        size_plan = selector.build_size_plan_from_stats(
            ratio_category_size_stats=ratio_category_size_stats,
            country_size_presence=country_size_presence,
        )
        policy_summary = self.storefront_policy.build_policy_summary(
            kept_by_category=dict(kept_by_category),
            removed_by_category=dict(removed_by_category),
        )

        async with ProdigiPrintAreaResolver() as print_area_resolver:
            bake = ProdigiStorefrontBakeOrm(
                bake_key=self._build_bake_key(paper_material, include_notice_level),
                paper_material=paper_material,
                include_notice_level=include_notice_level,
                status="ready",
                note=(
                    "Materialized directly from local Prodigi CSV files after category, "
                    "policy, ratio, and provider-pixel validation were applied."
                ),
            )
            self.db.session.add(bake)
            await self.db.session.flush()

            await self.db.session.execute(
                update(ProdigiStorefrontBakeOrm)
                .where(ProdigiStorefrontBakeOrm.id != bake.id)
                .values(is_active=False)
            )

            visible_country_codes: set[str] = set()
            visible_ratio_labels: set[str] = set()
            group_count = 0
            size_count = 0
            selected_storefront_preview: dict[str, Any] | None = None

            for ratio_meta in ratio_presets:
                ratio_label = ratio_meta["label"]
                ratio_category_slots = size_plan["global_shortlists"].get(ratio_label, {})
                if not ratio_category_slots:
                    continue

                selected_ratio_preview = self._build_selected_ratio_preview(
                    category_defs=category_defs,
                    policy_summary=policy_summary,
                    ratio_category_slots=ratio_category_slots,
                )
                available_countries = sorted(
                    country_size_presence.get(ratio_label, {}).keys()
                )

                for country_code in available_countries:
                    country_slots = size_plan["country_shortlists"].get(ratio_label, {}).get(
                        country_code,
                        {},
                    )
                    country_offers = self._build_country_offers(
                        offers_by_slot=offers_by_slot.get(ratio_label, {})
                        .get(country_code, {})
                    )
                    country_fulfillment = self._build_country_fulfillment(
                        destination_country=country_code,
                        category_defs=category_defs,
                        fulfillment_buckets=fulfillment_buckets.get(ratio_label, {})
                        .get(country_code, {}),
                    )
                    country_preview = self.preview_service._build_country_preview(
                        ratio=ratio_label,
                        country_code=country_code,
                        country_name=country_names.get(ratio_label, {}).get(
                            country_code,
                            country_code,
                        ),
                        category_defs=category_defs,
                        ratio_category_slots=ratio_category_slots,
                        country_slots=country_slots,
                        country_offers=country_offers,
                        country_fulfillment=country_fulfillment,
                    )
                    preview_payload = {
                        "selected_ratio": ratio_label,
                        "selected_country": country_code,
                        "selected_ratio_preview": selected_ratio_preview,
                        "selected_country_preview": country_preview,
                    }
                    storefront_preview = self.bake_service.build_storefront_country_preview(
                        preview_payload=preview_payload,
                        include_notice_level=include_notice_level,
                    )
                    await self.bake_service._enrich_storefront_print_areas(
                        storefront_preview,
                        print_area_resolver,
                    )
                    self.bake_service._keep_only_provider_print_area_sizes(
                        storefront_preview
                    )
                    await self.bake_service._keep_only_supported_canvas_wrap_sizes(
                        storefront_preview,
                        print_area_resolver,
                    )
                    self.bake_service._assert_provider_print_area_sizes(
                        storefront_preview
                    )

                    if not storefront_preview["visible_cards"]:
                        continue

                    if selected_storefront_preview is None or (
                        ratio_label == (selected_ratio or ratio_label)
                        and country_code == (selected_country or country_code)
                    ):
                        selected_storefront_preview = storefront_preview

                    visible_country_codes.add(country_code)
                    visible_ratio_labels.add(ratio_label)

                    for card in storefront_preview["visible_cards"]:
                        totals = [
                            size["total_cost"]
                            for size in card["size_options"]
                            if size.get("total_cost") is not None
                        ]
                        group = ProdigiStorefrontOfferGroupOrm(
                            bake_id=bake.id,
                            ratio_label=ratio_label,
                            ratio_title=ratio_meta["title"],
                            destination_country=storefront_preview["country_code"],
                            destination_country_name=storefront_preview["country_name"],
                            category_id=card["category_id"],
                            category_label=card["label"],
                            material_label=card["material_label"],
                            frame_label=card["frame_label"],
                            storefront_action=card["storefront_action"],
                            fulfillment_level=card["fulfillment_level"],
                            geography_scope=card["geography_scope"],
                            tax_risk=card["tax_risk"],
                            source_countries=card["source_countries"],
                            fastest_delivery_days=card["fastest_delivery_days"],
                            note=card["note"],
                            fixed_attributes=card["storefront_policy"]["fixed_attributes"],
                            recommended_defaults=card["storefront_policy"][
                                "recommended_defaults"
                            ],
                            allowed_attributes=card["storefront_policy"][
                                "allowed_attributes"
                            ],
                            available_shipping_tiers=card["available_shipping_tiers"],
                            default_shipping_tier=card["default_shipping_tier"],
                            available_size_count=len(card["size_options"]),
                            min_total_cost=min(totals) if totals else None,
                            max_total_cost=max(totals) if totals else None,
                            currency=card["price_range"]["currency"],
                        )
                        group.sizes = [
                            ProdigiStorefrontOfferSizeOrm(
                                slot_size_label=size["slot_size_label"],
                                size_label=size["size_label"],
                                available=True,
                                is_exact_match=size["is_exact_match"],
                                centroid_size_label=size["centroid_size_label"],
                                member_size_labels=size["member_size_labels"],
                                sku=size["sku"],
                                supplier_size_cm=size.get("size_cm"),
                                supplier_size_inches=size.get("size_inches"),
                                print_area_width_px=size.get("print_area_width_px"),
                                print_area_height_px=size.get("print_area_height_px"),
                                print_area_name=size.get("print_area_name"),
                                print_area_source=size.get("print_area_source"),
                                print_area_dimensions=size.get("print_area_dimensions"),
                                source_country=size["source_country"],
                                currency=size["currency"],
                                product_price=size["product_price"],
                                shipping_price=size["shipping_price"],
                                total_cost=size["total_cost"],
                                delivery_days=size["delivery_days"],
                                default_shipping_tier=size["default_shipping_tier"],
                                shipping_method=size["shipping_method"],
                                service_name=size["service_name"],
                                service_level=size["service_level"],
                                shipping_profiles=size["shipping_profiles"],
                            )
                            for size in card["size_options"]
                        ]
                        self.db.session.add(group)
                        group_count += 1
                        size_count += len(group.sizes)

        bake.ratio_count = len(visible_ratio_labels)
        bake.country_count = len(visible_country_codes)
        bake.offer_group_count = group_count
        bake.offer_size_count = size_count

        await self.db.commit()
        materialization = await ProdigiArtworkStorefrontMaterializerService(
            self.db
        ).materialize_active_bake()

        selected_ratio_value = selected_ratio or (selected_storefront_preview or {}).get("ratio")
        selected_country_value = selected_country or (
            selected_storefront_preview or {}
        ).get("country_code")

        return {
            "status": "baked",
            "message": (
                "Storefront snapshot was rebuilt directly from local Prodigi CSV files "
                "with pixel-first provider validation."
            ),
            "streamed_rows_matched": matched_row_count,
            "bake": {
                "id": bake.id,
                "bake_key": bake.bake_key,
                "paper_material": bake.paper_material,
                "include_notice_level": bake.include_notice_level,
                "ratio_count": bake.ratio_count,
                "country_count": bake.country_count,
                "offer_group_count": bake.offer_group_count,
                "offer_size_count": bake.offer_size_count,
            },
            "artwork_storefront_materialization": materialization,
            "selected_ratio": selected_ratio_value,
            "selected_country": selected_country_value,
            "selected_country_storefront_preview": selected_storefront_preview,
        }

    def _stream_csv_rows(
        self,
        *,
        category_defs: list[dict[str, Any]],
        selector: ProdigiSizeSelectorService,
    ) -> tuple[
        dict[str, Any],
        dict[str, Any],
        dict[str, Any],
        dict[str, Any],
        dict[str, Any],
        Counter,
        Counter,
        int,
    ]:
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
            lambda: defaultdict(
                lambda: defaultdict(lambda: defaultdict(dict))
            )
        )
        canvas_wraps_by_slot: dict[str, Any] = defaultdict(
            lambda: defaultdict(
                lambda: defaultdict(lambda: defaultdict(set))
            )
        )
        kept_by_category: Counter = Counter()
        removed_by_category: Counter = Counter()
        matched_row_count = 0

        for file_path in self.csv_import.discover_csv_files():
            with file_path.open("r", encoding="utf-8-sig", newline="") as handle:
                reader = csv.DictReader(handle)
                for row in reader:
                    parsed = self.csv_import._parse_row(file_path, row)
                    if not parsed or not parsed["is_relevant_for_artshop"]:
                        continue

                    ratio = selector.match_ratio(
                        parsed.get("size_cm"),
                        parsed.get("size_inches"),
                    )
                    dims = selector.parse_size_dims(
                        parsed.get("size_cm"),
                        parsed.get("size_inches"),
                    )
                    if ratio is None or dims is None:
                        continue

                    category_id = self._match_category_id(
                        parsed=parsed,
                        category_defs=category_defs,
                    )
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

                    offer = self._build_offer(parsed)
                    wrap = str(parsed.get("wrap") or "").strip()
                    if category_id in WRAPPED_CANVAS_CATEGORIES and wrap:
                        canvas_wraps_by_slot[ratio][destination_country][category_id][
                            dims.label
                        ].add(wrap)
                    tier = self.shipping_policy.normalize_tier(
                        offer.get("shipping_method"),
                        offer.get("service_level"),
                    )
                    existing = offers_by_slot[ratio][destination_country][category_id][
                        dims.label
                    ].get(tier)
                    if existing is None or self.shipping_policy._offer_rank(
                        offer,
                        destination_country,
                    ) < self.shipping_policy._offer_rank(existing, destination_country):
                        offers_by_slot[ratio][destination_country][category_id][dims.label][
                            tier
                        ] = offer

        self._prune_incomplete_canvas_wrap_slots(
            country_size_presence=country_size_presence,
            offers_by_slot=offers_by_slot,
            canvas_wraps_by_slot=canvas_wraps_by_slot,
        )

        return (
            ratio_category_size_stats,
            country_size_presence,
            country_names,
            fulfillment_buckets,
            offers_by_slot,
            kept_by_category,
            removed_by_category,
            matched_row_count,
        )

    def _prune_incomplete_canvas_wrap_slots(
        self,
        *,
        country_size_presence: dict[str, Any],
        offers_by_slot: dict[str, Any],
        canvas_wraps_by_slot: dict[str, Any],
    ) -> None:
        required_wraps = set(CANVAS_WRAP_OPTIONS)
        for ratio, country_map in canvas_wraps_by_slot.items():
            for country_code, category_map in country_map.items():
                for category_id, size_map in category_map.items():
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
                        offers_by_slot.get(ratio, {})
                        .get(country_code, {})
                        .get(category_id, {})
                    )
                    for size_label in blocked_labels:
                        slot_offers.pop(size_label, None)

    def _match_category_id(
        self,
        *,
        parsed: dict[str, Any],
        category_defs: list[dict[str, Any]],
    ) -> str | None:
        sku = (parsed.get("sku") or "").upper()
        description = (parsed.get("product_description") or "").upper()

        for category in category_defs:
            if parsed.get("normalized_medium") != category["medium"]:
                continue
            if parsed.get("normalized_material") != category["material"]:
                continue
            if parsed.get("normalized_presentation") not in category["presentation_values"]:
                continue
            if parsed.get("normalized_frame_type") not in category["frame_type_values"]:
                continue
            if any(
                pattern.upper() in sku
                for pattern in category.get("exclude_sku_patterns", ())
            ):
                continue
            if any(
                pattern.upper() in description
                for pattern in category.get("exclude_description_patterns", ())
            ):
                continue
            if any(
                pattern.upper() not in sku
                for pattern in category.get("include_sku_patterns", ())
            ):
                continue
            if any(
                pattern.upper() not in description
                for pattern in category.get("include_description_patterns", ())
            ):
                continue
            return category["id"]

        return None

    def _build_offer(self, parsed: dict[str, Any]) -> dict[str, Any]:
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

    def _build_selected_ratio_preview(
        self,
        *,
        category_defs: list[dict[str, Any]],
        policy_summary: dict[str, dict[str, Any]],
        ratio_category_slots: dict[str, list[dict[str, Any]]],
    ) -> dict[str, Any]:
        category_previews = []
        for category in category_defs:
            category_previews.append(
                {
                    "category_id": category["id"],
                    "storefront_policy": policy_summary.get(category["id"]),
                    "size_slots": ratio_category_slots.get(category["id"], []),
                }
            )
        return {"category_previews": category_previews}

    def _build_country_offers(self, *, offers_by_slot: dict[str, Any]) -> dict[str, Any]:
        country_offers: dict[str, dict[str, list[dict[str, Any]]]] = defaultdict(dict)
        for category_id, size_map in offers_by_slot.items():
            for size_label, tier_map in size_map.items():
                country_offers[category_id][size_label] = list(tier_map.values())
        return country_offers

    def _build_country_fulfillment(
        self,
        *,
        destination_country: str,
        category_defs: list[dict[str, Any]],
        fulfillment_buckets: dict[str, dict[str, Any]],
    ) -> dict[str, dict[str, Any]]:
        result: dict[str, dict[str, Any]] = {}
        for category in category_defs:
            category_id = category["id"]
            payload = fulfillment_buckets.get(category_id)
            if not payload:
                result[category_id] = self.fulfillment_policy.build_empty_country_category_summary(
                    destination_country
                )
                continue
            result[category_id] = self.fulfillment_policy._build_country_category_summary(
                destination_country=destination_country,
                source_countries=payload["source_countries"],
                row_count=payload["row_count"],
                fastest_min_shipping_days=payload["fastest_min_shipping_days"],
                fastest_max_shipping_days=payload["fastest_max_shipping_days"],
            )
        return result

    def _build_bake_key(self, paper_material: str, include_notice_level: bool) -> str:
        timestamp = datetime.now(UTC).strftime("%Y%m%d%H%M%S")
        mode = "notice" if include_notice_level else "strict"
        return f"{paper_material}-csv-{mode}-{timestamp}"

    def _to_float(self, value: Any) -> float:
        if value is None:
            return 0.0
        return round(float(value), 2)
