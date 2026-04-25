from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import update

from src.models.prodigi_storefront import (
    ProdigiStorefrontBakeOrm,
    ProdigiStorefrontOfferGroupOrm,
    ProdigiStorefrontOfferSizeOrm,
)
from src.services.artwork_print_profiles import (
    CANVAS_WRAP_OPTIONS,
    WRAPPED_CANVAS_CATEGORIES,
)
from src.services.prodigi_artwork_storefront_materializer import (
    ProdigiArtworkStorefrontMaterializerService,
)
from src.services.prodigi_catalog_preview import ProdigiCatalogPreviewService
from src.services.prodigi_print_area_resolver import ProdigiPrintAreaResolver
from src.services.prodigi_shipping_policy import ProdigiShippingPolicyService
from src.services.prodigi_shipping_support_policy import (
    ProdigiShippingSupportPolicyService,
)
from src.utils.db_manager import DBManager

MIRROR_WRAP_FALLBACK_MARGIN_PCT = 0.0
PROVIDER_PRINT_AREA_SOURCE = "prodigi_product_details"
PROVIDER_PRINT_AREA_SOURCES = {
    "prodigi_product_details",
    "prodigi_product_dimensions",
}
PIXEL_RATIO_TOLERANCE = 0.003


class ProdigiPrintAreaBakeError(RuntimeError):
    """Raised when a storefront bake would rely on non-provider pixel targets."""


class ProdigiStorefrontBakeService:
    """
    Materializes the curated admin preview into storefront-ready snapshot tables.

    Responsibilities:
    - decide what the actual storefront is allowed to expose,
    - persist that decision into dedicated bake tables,
    - return a frontend-friendly preview of the final card data shape.
    """

    def __init__(self, db: DBManager):
        self.db = db
        self.preview_service = ProdigiCatalogPreviewService(db)
        self.shipping_policy = ProdigiShippingPolicyService()
        self.shipping_support_policy = ProdigiShippingSupportPolicyService()

    async def bake_storefront(
        self,
        *,
        selected_ratio: str | None = None,
        selected_country: str | None = None,
        selected_paper_material: str | None = None,
        include_notice_level: bool = True,
    ) -> dict[str, Any]:
        dataset = await self.preview_service.get_catalog_dataset(selected_paper_material)
        selection = self.preview_service.resolve_selection(
            preview=dataset["preview"],
            ratio_presets=dataset["ratio_presets"],
            category_defs=dataset["category_defs"],
            selected_ratio=selected_ratio,
            selected_country=selected_country,
        )
        selected_preview_payload = self._make_preview_payload(
            dataset=dataset,
            selection=selection,
        )
        selected_storefront_preview = self.build_storefront_country_preview(
            preview_payload=selected_preview_payload,
            include_notice_level=include_notice_level,
        )
        async with ProdigiPrintAreaResolver() as print_area_resolver:
            await self._enrich_storefront_print_areas(
                selected_storefront_preview,
                print_area_resolver,
            )
            self._keep_only_provider_print_area_sizes(selected_storefront_preview)
            await self._keep_only_supported_canvas_wrap_sizes(
                selected_storefront_preview,
                print_area_resolver,
            )
            self._assert_provider_print_area_sizes(selected_storefront_preview)

            bake = ProdigiStorefrontBakeOrm(
                bake_key=self._build_bake_key(dataset["selected_paper_material"], include_notice_level),
                paper_material=dataset["selected_paper_material"],
                include_notice_level=include_notice_level,
                status="ready",
                note=(
                    "Materialized from Prodigi catalog preview after storefront, sizing, and "
                    "fulfillment policies were applied."
                ),
            )
            self.db.session.add(bake)
            await self.db.session.flush()

            await self.db.session.execute(
                update(ProdigiStorefrontBakeOrm)
                .where(ProdigiStorefrontBakeOrm.id != bake.id)
                .values(is_active=False)
            )

            group_count = 0
            size_count = 0
            visible_country_codes: set[str] = set()
            visible_ratio_labels: set[str] = set()

            for ratio_meta in dataset["ratio_presets"]:
                ratio_label = ratio_meta["label"]
                ratio_preview = dataset["preview"]["by_ratio"].get(ratio_label)
                if ratio_preview is None:
                    continue

                for country_option in ratio_preview["countries"]:
                    country_code = country_option["country_code"]
                    country_selection = self.preview_service.resolve_selection(
                        preview=dataset["preview"],
                        ratio_presets=dataset["ratio_presets"],
                        category_defs=dataset["category_defs"],
                        selected_ratio=ratio_label,
                        selected_country=country_code,
                    )
                    preview_payload = self._make_preview_payload(
                        dataset=dataset,
                        selection=country_selection,
                    )
                    storefront_preview = self.build_storefront_country_preview(
                        preview_payload=preview_payload,
                        include_notice_level=include_notice_level,
                    )
                    await self._enrich_storefront_print_areas(
                        storefront_preview,
                        print_area_resolver,
                    )
                    self._keep_only_provider_print_area_sizes(storefront_preview)
                    await self._keep_only_supported_canvas_wrap_sizes(
                        storefront_preview,
                        print_area_resolver,
                    )
                    self._assert_provider_print_area_sizes(storefront_preview)

                    if not storefront_preview["visible_cards"]:
                        continue

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

        return {
            "status": "baked",
            "message": (
                "Storefront snapshot was materialized into dedicated bake tables. "
                "The selected country preview below matches the data shape that the "
                "future product card can consume."
            ),
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
            "selected_ratio": selection["selected_ratio"],
            "selected_country": selection["selected_country"],
            "selected_country_storefront_preview": selected_storefront_preview,
        }

    def build_storefront_country_preview(
        self,
        *,
        preview_payload: dict[str, Any],
        include_notice_level: bool,
    ) -> dict[str, Any]:
        selected_ratio_preview = preview_payload["selected_ratio_preview"]
        selected_country_preview = preview_payload["selected_country_preview"]
        category_meta = {
            item["category_id"]: item for item in selected_ratio_preview["category_previews"]
        }

        visible_cards: list[dict[str, Any]] = []
        hidden_cards: list[dict[str, Any]] = []

        for row in selected_country_preview["category_rows"]:
            fulfillment_policy = row["fulfillment_policy"]
            category_summary = category_meta.get(row["category_id"], {})
            storefront_policy = category_summary.get("storefront_policy") or {
                "fixed_attributes": {},
                "recommended_defaults": {},
                "allowed_attributes": {},
            }

            size_options = [
                {
                    "slot_size_label": cell["slot_size_label"],
                    "size_label": cell["size_label"],
                    "is_exact_match": cell["is_exact_match"],
                    "centroid_size_label": cell["centroid_size_label"],
                    "member_size_labels": cell["member_size_labels"],
                    "sku": cell["offer"]["sku"],
                    "size_cm": cell["offer"].get("size_cm"),
                    "size_inches": cell["offer"].get("size_inches"),
                    "variant_key": cell["offer"].get("variant_key"),
                    "source_country": cell["offer"]["source_country"],
                    "currency": cell["offer"]["currency"],
                    "product_price": cell["offer"]["product_price"],
                    "shipping_price": cell["offer"]["shipping_price"],
                    "total_cost": cell["offer"]["total_cost"],
                    "delivery_days": cell["offer"]["delivery_days"],
                    "default_shipping_tier": cell["offer"]["default_shipping_tier"],
                    "shipping_method": cell["offer"]["shipping_method"],
                    "service_name": cell["offer"]["service_name"],
                    "service_level": cell["offer"]["service_level"],
                    "shipping_profiles": cell["offer"]["shipping_profiles"],
                }
                for cell in row["size_cells"]
                if cell["available"] and cell["offer"] is not None
            ]

            is_visible = self._is_visible_category(
                fulfillment_policy=fulfillment_policy,
                include_notice_level=include_notice_level,
            )
            if is_visible and size_options:
                totals = [item["total_cost"] for item in size_options if item["total_cost"] is not None]
                currency = next(
                    (item["currency"] for item in size_options if item.get("currency")),
                    None,
                )
                delivery_summary = self._summarize_delivery_days(size_options)
                shipping_summary = self.shipping_policy.summarize_group_shipping(size_options)
                size_options_with_support = []
                for item in size_options:
                    size_options_with_support.append(
                        {
                            **item,
                            "shipping_support": self.shipping_support_policy.evaluate_size(
                                item.get("shipping_profiles")
                            ),
                        }
                    )
                shipping_support = self.shipping_support_policy.summarize_group(
                    size_options_with_support
                )
                visible_cards.append(
                    {
                        "category_id": row["category_id"],
                        "label": row["label"],
                        "short_label": row["short_label"],
                        "material_label": row["material_label"],
                        "frame_label": row["frame_label"],
                        "storefront_action": fulfillment_policy["storefront_action"],
                        "fulfillment_level": fulfillment_policy["fulfillment_level"],
                        "geography_scope": fulfillment_policy["geography_scope"],
                        "tax_risk": fulfillment_policy["tax_risk"],
                        "source_countries": fulfillment_policy["source_countries"],
                        "fastest_delivery_days": delivery_summary
                        or fulfillment_policy["fastest_delivery_days"],
                        "note": fulfillment_policy["note"],
                        "storefront_policy": {
                            "fixed_attributes": storefront_policy["fixed_attributes"],
                            "recommended_defaults": storefront_policy["recommended_defaults"],
                            "allowed_attributes": storefront_policy["allowed_attributes"],
                        },
                        "available_shipping_tiers": shipping_summary["available_shipping_tiers"],
                        "default_shipping_tier": shipping_summary["default_shipping_tier"],
                        "shipping_support": shipping_support,
                        "available_size_count": len(size_options_with_support),
                        "size_labels": [item["size_label"] for item in size_options_with_support],
                        "price_range": {
                            "currency": currency,
                            "min_total": min(totals) if totals else None,
                            "max_total": max(totals) if totals else None,
                        },
                        "size_options": size_options_with_support,
                    }
                )
                continue

            hidden_reason = (
                "Hidden by storefront mode."
                if not is_visible
                else "No exact size options remain for this country after filtering."
            )
            hidden_cards.append(
                {
                    "category_id": row["category_id"],
                    "label": row["label"],
                    "reason": hidden_reason,
                    "storefront_action": fulfillment_policy["storefront_action"],
                    "fulfillment_level": fulfillment_policy["fulfillment_level"],
                    "geography_scope": fulfillment_policy["geography_scope"],
                    "tax_risk": fulfillment_policy["tax_risk"],
                }
            )

        return {
            "storefront_mode": (
                "include_notice_level" if include_notice_level else "primary_only"
            ),
            "country_code": selected_country_preview["country_code"],
            "country_name": selected_country_preview["country_name"],
            "ratio": preview_payload["selected_ratio"],
            "visible_cards": visible_cards,
            "hidden_cards": hidden_cards,
        }

    async def _enrich_storefront_print_areas(
        self,
        storefront_preview: dict[str, Any],
        print_area_resolver: ProdigiPrintAreaResolver,
    ) -> None:
        for card in storefront_preview.get("visible_cards", []):
            category_id = card["category_id"]
            default_attributes = self._build_default_attributes(
                fixed_attributes=card["storefront_policy"]["fixed_attributes"],
                recommended_defaults=card["storefront_policy"]["recommended_defaults"],
                allowed_attributes=card["storefront_policy"]["allowed_attributes"],
            )
            for size in card.get("size_options", []):
                dimensions = await print_area_resolver.resolve(
                    sku=size.get("sku"),
                    destination_country=storefront_preview.get("country_code"),
                    category_id=category_id,
                    attributes=default_attributes,
                    optional_attribute_keys=self._optional_provider_attribute_keys(category_id),
                    supplier_size_inches=size.get("size_inches"),
                    supplier_size_cm=size.get("size_cm"),
                    slot_size_label=size.get("slot_size_label"),
                    wrap_margin_pct=MIRROR_WRAP_FALLBACK_MARGIN_PCT,
                )
                size.update(dimensions)

    def _keep_only_provider_print_area_sizes(self, storefront_preview: dict[str, Any]) -> None:
        visible_cards: list[dict[str, Any]] = []
        hidden_cards = list(storefront_preview.get("hidden_cards", []))
        removed_sizes: list[dict[str, Any]] = []

        for card in storefront_preview.get("visible_cards", []):
            kept_sizes = []
            for size in card.get("size_options", []):
                if size.get("print_area_source") not in PROVIDER_PRINT_AREA_SOURCES:
                    removed_sizes.append(
                        {
                            "country_code": storefront_preview.get("country_code"),
                            "ratio": storefront_preview.get("ratio"),
                            "category_id": card.get("category_id"),
                            "slot_size_label": size.get("slot_size_label"),
                            "sku": size.get("sku"),
                            "print_area_source": size.get("print_area_source"),
                            "reason": "missing_provider_pixels",
                        }
                    )
                    continue

                ratio_delta = self._pixel_ratio_delta(
                    ratio_label=storefront_preview.get("ratio"),
                    size=size,
                )
                if ratio_delta is not None and ratio_delta > PIXEL_RATIO_TOLERANCE:
                    removed_sizes.append(
                        {
                            "country_code": storefront_preview.get("country_code"),
                            "ratio": storefront_preview.get("ratio"),
                            "category_id": card.get("category_id"),
                            "slot_size_label": size.get("slot_size_label"),
                            "sku": size.get("sku"),
                            "print_area_source": size.get("print_area_source"),
                            "reason": "visible_art_ratio_mismatch",
                            "ratio_delta": round(ratio_delta, 6),
                            "visible_art_width_px": self._visible_art_width_px(size),
                            "visible_art_height_px": self._visible_art_height_px(size),
                        }
                    )
                    continue

                kept_sizes.append(size)

            if not kept_sizes:
                hidden_cards.append(
                    {
                        "category_id": card.get("category_id"),
                        "label": card.get("label"),
                        "reason": (
                            "No size options remain after provider pixel validation."
                        ),
                        "storefront_action": card.get("storefront_action"),
                        "fulfillment_level": card.get("fulfillment_level"),
                        "geography_scope": card.get("geography_scope"),
                        "tax_risk": card.get("tax_risk"),
                    }
                )
                continue

            card["size_options"] = kept_sizes
            card["available_size_count"] = len(kept_sizes)
            card["size_labels"] = [item["size_label"] for item in kept_sizes]
            totals = [item["total_cost"] for item in kept_sizes if item.get("total_cost") is not None]
            currency = next((item.get("currency") for item in kept_sizes if item.get("currency")), None)
            card["price_range"] = {
                "currency": currency,
                "min_total": min(totals) if totals else None,
                "max_total": max(totals) if totals else None,
            }
            visible_cards.append(card)

        storefront_preview["visible_cards"] = visible_cards
        storefront_preview["hidden_cards"] = hidden_cards
        storefront_preview["removed_size_options_without_provider_print_area"] = removed_sizes
        storefront_preview["removed_size_options"] = removed_sizes

    async def _keep_only_supported_canvas_wrap_sizes(
        self,
        storefront_preview: dict[str, Any],
        print_area_resolver: ProdigiPrintAreaResolver,
    ) -> None:
        visible_cards: list[dict[str, Any]] = []
        hidden_cards = list(storefront_preview.get("hidden_cards", []))
        removed_sizes = list(storefront_preview.get("removed_size_options") or [])
        required_wraps = set(CANVAS_WRAP_OPTIONS)

        for card in storefront_preview.get("visible_cards", []):
            category_id = card.get("category_id")
            if category_id not in WRAPPED_CANVAS_CATEGORIES:
                visible_cards.append(card)
                continue

            kept_sizes = []
            for size in card.get("size_options", []):
                available_wraps = await print_area_resolver.get_available_attribute_values(
                    sku=size.get("sku"),
                    destination_country=storefront_preview.get("country_code"),
                    attribute_key="wrap",
                )
                if required_wraps.issubset(available_wraps):
                    kept_sizes.append(size)
                    continue

                removed_sizes.append(
                    {
                        "country_code": storefront_preview.get("country_code"),
                        "ratio": storefront_preview.get("ratio"),
                        "category_id": category_id,
                        "slot_size_label": size.get("slot_size_label"),
                        "sku": size.get("sku"),
                        "reason": "missing_required_canvas_wraps",
                        "required_wraps": sorted(required_wraps),
                        "available_wraps": sorted(available_wraps),
                    }
                )

            if not kept_sizes:
                hidden_cards.append(
                    {
                        "category_id": card.get("category_id"),
                        "label": card.get("label"),
                        "reason": (
                            "No size options remain after canvas wrap support validation."
                        ),
                        "storefront_action": card.get("storefront_action"),
                        "fulfillment_level": card.get("fulfillment_level"),
                        "geography_scope": card.get("geography_scope"),
                        "tax_risk": card.get("tax_risk"),
                    }
                )
                continue

            card["size_options"] = kept_sizes
            card["available_size_count"] = len(kept_sizes)
            card["size_labels"] = [item["size_label"] for item in kept_sizes]
            totals = [item["total_cost"] for item in kept_sizes if item.get("total_cost") is not None]
            currency = next((item.get("currency") for item in kept_sizes if item.get("currency")), None)
            card["price_range"] = {
                "currency": currency,
                "min_total": min(totals) if totals else None,
                "max_total": max(totals) if totals else None,
            }
            visible_cards.append(card)

        storefront_preview["visible_cards"] = visible_cards
        storefront_preview["hidden_cards"] = hidden_cards
        storefront_preview["removed_size_options"] = removed_sizes
        storefront_preview["removed_size_options_without_provider_print_area"] = removed_sizes

    def _assert_provider_print_area_sizes(self, storefront_preview: dict[str, Any]) -> None:
        missing: list[str] = []
        for card in storefront_preview.get("visible_cards", []):
            for size in card.get("size_options", []):
                if size.get("print_area_source") in PROVIDER_PRINT_AREA_SOURCES:
                    continue
                missing.append(
                    " / ".join(
                        [
                            str(storefront_preview.get("country_code") or "?"),
                            str(storefront_preview.get("ratio") or "?"),
                            str(card.get("category_id") or "?"),
                            str(size.get("slot_size_label") or "?"),
                            str(size.get("sku") or "?"),
                            str(size.get("print_area_source") or "unresolved"),
                        ]
                    )
                )

        if not missing:
            return

        examples = "; ".join(missing[:10])
        extra = f" (+{len(missing) - 10} more)" if len(missing) > 10 else ""
        raise ProdigiPrintAreaBakeError(
            "Prodigi storefront bake requires provider pixel targets for every visible "
            "offer size. Accepted sources are Product Details printAreaSizes or Product "
            "Details productDimensions. Missing provider pixels: "
            f"{examples}{extra}. Check PRODIGI_API_KEY and Product Details API coverage."
        )

    def _build_default_attributes(
        self,
        *,
        fixed_attributes: dict[str, Any],
        recommended_defaults: dict[str, Any],
        allowed_attributes: dict[str, list[Any]],
    ) -> dict[str, Any]:
        defaults: dict[str, Any] = {}
        for key, value in fixed_attributes.items():
            defaults[key] = value
        for key, value in recommended_defaults.items():
            defaults.setdefault(key, value)
        for key, values in allowed_attributes.items():
            if key not in defaults and values:
                defaults[key] = values[0]
        return defaults

    def _optional_provider_attribute_keys(self, category_id: str) -> set[str]:
        return set()

    def _pixel_ratio_delta(
        self,
        *,
        ratio_label: str | None,
        size: dict[str, Any],
    ) -> float | None:
        if not ratio_label or ":" not in ratio_label:
            return None

        width = self._visible_art_width_px(size)
        height = self._visible_art_height_px(size)
        if width is None or height is None or width <= 0 or height <= 0:
            return None

        short_edge, long_edge = sorted((width, height))
        target_left, target_right = ratio_label.split(":", 1)
        try:
            target_ratio = int(target_left) / int(target_right)
        except (TypeError, ValueError, ZeroDivisionError):
            return None

        actual_ratio = short_edge / long_edge
        return abs(actual_ratio - target_ratio)

    def _visible_art_width_px(self, size: dict[str, Any]) -> int | None:
        direct = size.get("visible_art_width_px")
        if direct:
            return int(direct)
        dimensions = size.get("print_area_dimensions") or {}
        value = dimensions.get("visible_art_width_px")
        return int(value) if value else size.get("print_area_width_px")

    def _visible_art_height_px(self, size: dict[str, Any]) -> int | None:
        direct = size.get("visible_art_height_px")
        if direct:
            return int(direct)
        dimensions = size.get("print_area_dimensions") or {}
        value = dimensions.get("visible_art_height_px")
        return int(value) if value else size.get("print_area_height_px")

    def _is_visible_category(
        self,
        *,
        fulfillment_policy: dict[str, Any],
        include_notice_level: bool,
    ) -> bool:
        action = fulfillment_policy["storefront_action"]
        if action == "show":
            return True
        if action == "show_with_notice":
            return include_notice_level
        return False

    def _make_preview_payload(
        self,
        *,
        dataset: dict[str, Any],
        selection: dict[str, Any],
    ) -> dict[str, Any]:
        return {
            "selected_ratio": selection["selected_ratio"],
            "selected_country": selection["selected_country"],
            "selected_ratio_preview": selection["selected_ratio_preview"],
            "selected_country_preview": selection["selected_country_preview"],
            "categories": dataset["category_defs"],
            "selected_paper_material": dataset["selected_paper_material"],
        }

    def _build_bake_key(self, paper_material: str, include_notice_level: bool) -> str:
        timestamp = datetime.now(UTC).strftime("%Y%m%d%H%M%S")
        mode = "notice" if include_notice_level else "strict"
        return f"{paper_material}-{mode}-{timestamp}"

    def _summarize_delivery_days(self, size_options: list[dict[str, Any]]) -> str | None:
        minimums: list[int] = []
        maximums: list[int] = []

        for item in size_options:
            parsed = self._parse_delivery_days(item.get("delivery_days"))
            if parsed is None:
                continue
            min_days, max_days = parsed
            minimums.append(min_days)
            maximums.append(max_days)

        if not minimums or not maximums:
            return None

        global_min = min(minimums)
        global_max = max(maximums)
        if global_min == global_max:
            return f"{global_min} days"
        return f"{global_min}-{global_max} days"

    def _parse_delivery_days(self, value: Any) -> tuple[int, int] | None:
        if value is None:
            return None

        text = str(value).strip().lower().replace("days", "").replace("day", "").strip()
        if not text:
            return None

        if "-" in text:
            left, right = text.split("-", 1)
            try:
                return int(left.strip()), int(right.strip())
            except ValueError:
                return None

        if text.endswith("+"):
            text = text[:-1].strip()

        try:
            day = int(text)
        except ValueError:
            return None
        return day, day
