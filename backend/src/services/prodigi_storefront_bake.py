from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import update

from src.models.prodigi_storefront import (
    ProdigiStorefrontBakeOrm,
    ProdigiStorefrontOfferGroupOrm,
    ProdigiStorefrontOfferSizeOrm,
)
from src.services.prodigi_catalog_preview import ProdigiCatalogPreviewService
from src.utils.db_manager import DBManager


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
                            source_country=size["source_country"],
                            currency=size["currency"],
                            product_price=size["product_price"],
                            shipping_price=size["shipping_price"],
                            total_cost=size["total_cost"],
                            delivery_days=size["delivery_days"],
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
                    "source_country": cell["offer"]["source_country"],
                    "currency": cell["offer"]["currency"],
                    "product_price": cell["offer"]["product_price"],
                    "shipping_price": cell["offer"]["shipping_price"],
                    "total_cost": cell["offer"]["total_cost"],
                    "delivery_days": cell["offer"]["delivery_days"],
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
                        "fastest_delivery_days": fulfillment_policy["fastest_delivery_days"],
                        "note": fulfillment_policy["note"],
                        "storefront_policy": {
                            "fixed_attributes": storefront_policy["fixed_attributes"],
                            "recommended_defaults": storefront_policy["recommended_defaults"],
                            "allowed_attributes": storefront_policy["allowed_attributes"],
                        },
                        "available_size_count": len(size_options),
                        "size_labels": [item["size_label"] for item in size_options],
                        "price_range": {
                            "currency": currency,
                            "min_total": min(totals) if totals else None,
                            "max_total": max(totals) if totals else None,
                        },
                        "size_options": size_options,
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
