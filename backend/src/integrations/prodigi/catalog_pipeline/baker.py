from __future__ import annotations

from collections import defaultdict
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import update

from src.integrations.prodigi.catalog_pipeline.planner import ProdigiCatalogSnapshotPlan
from src.integrations.prodigi.services.prodigi_print_area_resolver import ProdigiPrintAreaResolver
from src.models.prodigi_storefront import (
    ProdigiStorefrontBakeOrm,
    ProdigiStorefrontOfferGroupOrm,
    ProdigiStorefrontOfferSizeOrm,
)


class ProdigiCatalogSnapshotBaker:
    """Writes a planned CSV storefront snapshot into active bake tables."""

    def __init__(
        self,
        *,
        db: Any,
        preview_service: Any,
        bake_service: Any,
        fulfillment_policy: Any,
        storefront_policy: Any,
    ):
        self.db = db
        self.preview_service = preview_service
        self.bake_service = bake_service
        self.fulfillment_policy = fulfillment_policy
        self.storefront_policy = storefront_policy

    async def bake(
        self,
        *,
        plan: ProdigiCatalogSnapshotPlan,
        size_plan: dict[str, Any],
        ratio_presets: list[dict[str, Any]],
        category_defs: list[dict[str, Any]],
        paper_material: str,
        include_notice_level: bool,
        selected_ratio: str | None,
        selected_country: str | None,
        source_payload: dict[str, Any],
    ) -> dict[str, Any]:
        policy_summary = self.storefront_policy.build_policy_summary(
            kept_by_category=dict(plan.kept_by_category),
            removed_by_category=dict(plan.removed_by_category),
        )

        async with ProdigiPrintAreaResolver() as print_area_resolver:
            bake = ProdigiStorefrontBakeOrm(
                bake_key=self._build_bake_key(paper_material, include_notice_level),
                paper_material=paper_material,
                include_notice_level=include_notice_level,
                source_sha256=source_payload.get("sha256"),
                source_row_count=source_payload.get("rows_seen"),
                source_size_bytes=source_payload.get("size_bytes"),
                pipeline_version=source_payload.get("pipeline_version"),
                policy_version=source_payload.get("policy_version"),
                status="ready",
                note=(
                    "Materialized from the committed curated Prodigi CSV source after "
                    "category, policy, ratio, and provider-pixel validation were applied."
                ),
            )
            self.db.session.add(bake)
            await self.db.session.flush()

            await self.db.session.execute(
                update(ProdigiStorefrontBakeOrm)
                .where(ProdigiStorefrontBakeOrm.id != bake.id)
                .values(is_active=False)
            )

            selected_storefront_preview: dict[str, Any] | None = None
            visible_country_codes: set[str] = set()
            visible_ratio_labels: set[str] = set()
            group_count = 0
            size_count = 0

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
                    plan.country_size_presence.get(ratio_label, {}).keys()
                )

                for country_code in available_countries:
                    country_slots = size_plan["country_shortlists"].get(ratio_label, {}).get(
                        country_code,
                        {},
                    )
                    country_offers = self._build_country_offers(
                        offers_by_slot=plan.offers_by_slot.get(ratio_label, {})
                        .get(country_code, {})
                    )
                    country_fulfillment = self._build_country_fulfillment(
                        destination_country=country_code,
                        category_defs=category_defs,
                        fulfillment_buckets=plan.fulfillment_buckets.get(ratio_label, {}).get(
                            country_code,
                            {},
                        ),
                    )
                    country_preview = self.preview_service._build_country_preview(
                        ratio=ratio_label,
                        country_code=country_code,
                        country_name=plan.country_names.get(ratio_label, {}).get(
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
                    self.bake_service._keep_only_provider_print_area_sizes(storefront_preview)
                    await self.bake_service._keep_only_supported_canvas_wrap_sizes(
                        storefront_preview,
                        print_area_resolver,
                    )
                    self.bake_service._assert_provider_print_area_sizes(storefront_preview)

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
                        group = self._build_group(
                            bake_id=bake.id,
                            ratio_label=ratio_label,
                            ratio_title=ratio_meta["title"],
                            country_code=country_code,
                            storefront_preview=storefront_preview,
                            card=card,
                        )
                        self.db.session.add(group)
                        group_count += 1
                        size_count += len(group.sizes)

        bake.ratio_count = len(visible_ratio_labels)
        bake.country_count = len(visible_country_codes)
        bake.offer_group_count = group_count
        bake.offer_size_count = size_count
        await self.db.commit()

        return {
            "bake": bake,
            "selected_storefront_preview": selected_storefront_preview,
            "visible_ratio_count": len(visible_ratio_labels),
            "visible_country_count": len(visible_country_codes),
            "group_count": group_count,
            "size_count": size_count,
        }

    def _build_group(
        self,
        *,
        bake_id: int,
        ratio_label: str,
        ratio_title: str | None,
        country_code: str,
        storefront_preview: dict[str, Any],
        card: dict[str, Any],
    ) -> ProdigiStorefrontOfferGroupOrm:
        totals = [
            size["total_cost"]
            for size in card["size_options"]
            if size.get("total_cost") is not None
        ]
        group = ProdigiStorefrontOfferGroupOrm(
            bake_id=bake_id,
            ratio_label=ratio_label,
            ratio_title=ratio_title,
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
            recommended_defaults=card["storefront_policy"]["recommended_defaults"],
            allowed_attributes=card["storefront_policy"]["allowed_attributes"],
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
        return group

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
