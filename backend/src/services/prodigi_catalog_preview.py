from __future__ import annotations

from collections import defaultdict
from typing import Any

from sqlalchemy import text

from src.repositories.prodigi_catalog import ProdigiCatalogRepository
from src.services.prodigi_fulfillment_policy import ProdigiFulfillmentPolicyService
from src.services.prodigi_shipping_policy import ProdigiShippingPolicyService
from src.services.prodigi_sizing.selector import ProdigiSizeSelectorService
from src.services.prodigi_storefront_policy import ProdigiStorefrontPolicyService
from src.utils.db_manager import DBManager

DEFAULT_RATIO_PRESETS = (
    {
        "label": "4:5",
        "title": "Core Portrait",
        "description": "Primary gallery ratio for most flagship works.",
        "sort_order": 0,
    },
    {
        "label": "1:1",
        "title": "Square",
        "description": "Strong for modern crops, detail studies, and social-first pieces.",
        "sort_order": 1,
    },
    {
        "label": "2:3",
        "title": "Classic Fine Art",
        "description": "Popular print ratio with broad frame availability.",
        "sort_order": 2,
    },
    {
        "label": "3:4",
        "title": "Collector Portrait",
        "description": "Common portrait format with balanced wall presence.",
        "sort_order": 3,
    },
    {
        "label": "5:7",
        "title": "Editorial",
        "description": "Useful secondary portrait ratio for selective catalog expansion.",
        "sort_order": 4,
    },
)

DEFAULT_PAPER_MATERIAL = "hahnemuhle_german_etching"

PAPER_MATERIAL_OPTIONS = (
    {
        "id": "hahnemuhle_german_etching",
        "label": "Hahnemuhle German Etching",
        "description": "Current premium default with strong real-world coverage across our target ratios.",
        "is_default": True,
    },
    {
        "id": "hahnemuhle_photo_rag",
        "label": "Hahnemuhle Photo Rag",
        "description": "Artist-preferred cotton paper, but currently sparse in supplier CSV coverage.",
        "is_default": False,
    },
    {
        "id": "enhanced_matte_art_paper",
        "label": "Enhanced Matte Art Paper",
        "description": "Broadest operational coverage for unframed paper offers.",
        "is_default": False,
    },
    {
        "id": "smooth_art_paper",
        "label": "Smooth Art Paper",
        "description": "Secondary art paper option with moderate global availability.",
        "is_default": False,
    },
    {
        "id": "cold_press_watercolour_paper",
        "label": "Cold Press Watercolour Paper",
        "description": "Textured fine art paper for softer painterly reproduction.",
        "is_default": False,
    },
    {
        "id": "baryta_art_paper",
        "label": "Baryta Art Paper",
        "description": "Glossier fine art paper with more selective route coverage.",
        "is_default": False,
    },
)

PAPER_CATEGORY_TEMPLATES = (
    {
        "id": "paperPrintRolled",
        "label": "Paper Print Unframed",
        "short_label": "Paper Unframed",
        "medium": "paper",
        "presentation_values": ("rolled", None),
        "frame_type_values": (None,),
        "frame_label": "No frame / supplier unframed",
        "sort_order": 0,
    },
    {
        "id": "paperPrintClassicFramed",
        "label": "Paper Print Classic Framed",
        "short_label": "Paper Classic",
        "medium": "paper",
        "presentation_values": ("framed",),
        "frame_type_values": ("classic_frame",),
        "frame_label": "Classic frame",
        "include_sku_patterns": ("-NM-",),
        "sort_order": 1,
    },
    {
        "id": "paperPrintClassicFramedMounted",
        "label": "Paper Print Classic Framed with Mount",
        "short_label": "Paper Classic Mount",
        "medium": "paper",
        "presentation_values": ("framed",),
        "frame_type_values": ("classic_frame",),
        "frame_label": "Classic frame with mount",
        "include_sku_patterns": ("MOUNT2",),
        "sort_order": 2,
    },
    {
        "id": "paperPrintBoxFramed",
        "label": "Paper Print Box Framed",
        "short_label": "Paper Box",
        "medium": "paper",
        "presentation_values": ("framed",),
        "frame_type_values": ("box_frame",),
        "frame_label": "Box frame",
        "include_sku_patterns": ("-NM-",),
        "sort_order": 3,
    },
    {
        "id": "paperPrintBoxFramedMounted",
        "label": "Paper Print Box Framed with Mount",
        "short_label": "Paper Box Mount",
        "medium": "paper",
        "presentation_values": ("framed",),
        "frame_type_values": ("box_frame",),
        "frame_label": "Box frame with mount",
        "include_sku_patterns": ("MOUNT2",),
        "sort_order": 4,
    },
)

CANVAS_CATEGORY_DEFS = (
    {
        "id": "canvasRolled",
        "label": "Canvas Rolled",
        "short_label": "Canvas Rolled",
        "medium": "canvas",
        "presentation_values": ("rolled",),
        "frame_type_values": ("no_frame",),
        "material": "standard_canvas",
        "material_label": "Standard Canvas",
        "frame_label": "No frame",
        "sort_order": 2,
    },
    {
        "id": "canvasStretched",
        "label": "Canvas Stretched",
        "short_label": "Canvas Stretched",
        "medium": "canvas",
        "presentation_values": ("stretched",),
        "frame_type_values": ("stretched_canvas",),
        "material": "standard_canvas",
        "material_label": "Standard Canvas",
        "frame_label": "38mm stretched canvas",
        "exclude_sku_patterns": ("SLIMCAN",),
        "exclude_description_patterns": ("19mm",),
        "sort_order": 3,
    },
    {
        "id": "canvasClassicFrame",
        "label": "Canvas Classic Frame",
        "short_label": "Canvas Classic",
        "medium": "canvas",
        "presentation_values": ("framed",),
        "frame_type_values": ("classic_frame",),
        "material": "standard_canvas",
        "material_label": "Standard Canvas",
        "frame_label": "Classic frame",
        "sort_order": 4,
    },
    {
        "id": "canvasFloatingFrame",
        "label": "Canvas Floating Frame",
        "short_label": "Canvas Float",
        "medium": "canvas",
        "presentation_values": ("framed",),
        "frame_type_values": ("floating_frame",),
        "material": "standard_canvas",
        "material_label": "Standard Canvas",
        "frame_label": "Floating frame",
        "sort_order": 5,
    },
)


class ProdigiCatalogPreviewService:
    """
    Orchestrates admin preview payloads for curated Prodigi catalog data.

    Responsibilities:
    - load curated route rows through the repository layer,
    - apply ratio-aware shortlist selection through the sizing service,
    - assemble a dense admin-facing preview payload.
    """

    def __init__(self, db: DBManager):
        self.db = db
        self.catalog_repository = ProdigiCatalogRepository(db.session)
        self.storefront_policy = ProdigiStorefrontPolicyService()
        self.fulfillment_policy = ProdigiFulfillmentPolicyService()
        self.shipping_policy = ProdigiShippingPolicyService()

    async def get_catalog_dataset(
        self,
        selected_paper_material: str | None = None,
    ) -> dict[str, Any]:
        selected_paper_material = self._normalize_paper_material(selected_paper_material)
        category_defs = self.get_category_defs(selected_paper_material)
        ratio_presets = await self._get_ratio_presets()
        if not ratio_presets:
            ratio_presets = list(DEFAULT_RATIO_PRESETS)

        selector = ProdigiSizeSelectorService(
            ratio_labels=[item["label"] for item in ratio_presets]
        )
        curated_rows = await self.catalog_repository.get_curated_rows(category_defs)
        policy_result = self.storefront_policy.apply(curated_rows)
        rows = policy_result["rows"]
        size_plan = selector.build_size_plan(rows)
        fulfillment_result = self.fulfillment_policy.build(rows, selector)
        preview = self._build_preview(
            rows=rows,
            ratio_presets=ratio_presets,
            category_defs=category_defs,
            selector=selector,
            size_plan=size_plan,
            policy_summary=policy_result["policy_summary"],
            fulfillment_summary=fulfillment_result["by_ratio"],
        )

        return {
            "selected_paper_material": selected_paper_material,
            "category_defs": category_defs,
            "ratio_presets": ratio_presets,
            "preview": preview,
            "policy_filtered_out_routes": policy_result["removed_route_count"],
        }

    async def get_preview(
        self,
        selected_ratio: str | None = None,
        selected_country: str | None = None,
        selected_paper_material: str | None = None,
    ) -> dict[str, Any]:
        dataset = await self.get_catalog_dataset(selected_paper_material)
        selection = self.resolve_selection(
            preview=dataset["preview"],
            ratio_presets=dataset["ratio_presets"],
            category_defs=dataset["category_defs"],
            selected_ratio=selected_ratio,
            selected_country=selected_country,
        )

        return {
            "selected_ratio": selection["selected_ratio"],
            "selected_country": selection["selected_country"],
            "selected_paper_material": dataset["selected_paper_material"],
            "ratios": dataset["ratio_presets"],
            "paper_materials": list(PAPER_MATERIAL_OPTIONS),
            "categories": dataset["category_defs"],
            "ratio_cards": dataset["preview"]["ratio_cards"],
            "selected_ratio_preview": selection["selected_ratio_preview"],
            "selected_country_preview": selection["selected_country_preview"],
            "country_count": dataset["preview"]["country_count"],
            "generated_from_curated_routes": dataset["preview"]["curated_route_count"],
            "policy_filtered_out_routes": dataset["policy_filtered_out_routes"],
        }

    async def request_bake(
        self,
        selected_ratio: str | None = None,
        selected_country: str | None = None,
        selected_paper_material: str | None = None,
    ) -> dict[str, Any]:
        preview = await self.get_preview(
            selected_ratio=selected_ratio,
            selected_country=selected_country,
            selected_paper_material=selected_paper_material,
        )
        return {
            "status": "preview_ready",
            "message": (
                "Preview checkpoint is ready. Final bake into storefront offer tables is "
                "intentionally kept as the next explicit step after taxonomy approval."
            ),
            "selected_ratio": preview["selected_ratio"],
            "selected_country": preview["selected_country"],
            "selected_paper_material": preview["selected_paper_material"],
            "generated_from_curated_routes": preview["generated_from_curated_routes"],
        }

    async def _get_ratio_presets(self) -> list[dict[str, Any]]:
        result = await self.db.session.execute(
            text(
                """
                SELECT label, description, sort_order
                FROM print_aspect_ratios
                ORDER BY sort_order, label
                """
            )
        )

        by_label: dict[str, dict[str, Any]] = {
            item["label"]: dict(item) for item in DEFAULT_RATIO_PRESETS
        }
        for row in result.mappings():
            existing = by_label.get(row["label"], {})
            by_label[row["label"]] = {
                "label": row["label"],
                "title": existing.get("title") or row["label"],
                "description": row["description"] or existing.get("description") or "",
                "sort_order": row["sort_order"],
            }

        return sorted(by_label.values(), key=lambda item: (item["sort_order"], item["label"]))

    def resolve_selection(
        self,
        preview: dict[str, Any],
        ratio_presets: list[dict[str, Any]],
        category_defs: list[dict[str, Any]],
        selected_ratio: str | None,
        selected_country: str | None,
    ) -> dict[str, Any]:
        selected_ratio = selected_ratio or ratio_presets[0]["label"]
        valid_ratios = {item["label"] for item in ratio_presets}
        if selected_ratio not in valid_ratios:
            selected_ratio = ratio_presets[0]["label"]

        selected_ratio_preview = preview["by_ratio"].get(
            selected_ratio,
            self._empty_ratio_preview(selected_ratio, category_defs),
        )
        selected_ratio_internal = preview["internals_by_ratio"].get(selected_ratio)

        countries = selected_ratio_preview.get("countries", [])
        selected_country = (selected_country or "").upper()
        if countries:
            country_codes = {item["country_code"] for item in countries}
            if selected_country not in country_codes:
                selected_country = "DE" if "DE" in country_codes else countries[0]["country_code"]
        else:
            selected_country = selected_country or "DE"

        if selected_ratio_internal is not None:
            selected_country_preview = self._build_country_preview(
                ratio=selected_ratio,
                country_code=selected_country,
                country_name=selected_ratio_internal["country_names"].get(
                    selected_country,
                    selected_country,
                ),
                category_defs=category_defs,
                ratio_category_slots=selected_ratio_internal["ratio_category_slots"],
                country_slots=selected_ratio_internal["country_slots"].get(selected_country, {}),
                country_offers=selected_ratio_internal["country_offers"].get(selected_country, {}),
                country_fulfillment=selected_ratio_internal["country_fulfillment"].get(
                    selected_country,
                    {},
                ),
            )
        else:
            selected_country_preview = self._empty_country_preview(selected_country, category_defs)

        return {
            "selected_ratio": selected_ratio,
            "selected_country": selected_country,
            "selected_ratio_preview": selected_ratio_preview,
            "selected_country_preview": selected_country_preview,
        }

    def _build_preview(
        self,
        rows: list[dict[str, Any]],
        ratio_presets: list[dict[str, Any]],
        category_defs: list[dict[str, Any]],
        selector: ProdigiSizeSelectorService,
        size_plan: dict[str, Any],
        policy_summary: dict[str, dict[str, Any]],
        fulfillment_summary: dict[str, dict[str, dict[str, Any]]],
    ) -> dict[str, Any]:
        ratio_lookup = {item["label"]: item for item in ratio_presets}
        global_shortlists = size_plan["global_shortlists"]
        country_shortlists = size_plan["country_shortlists"]

        ratio_category_countries: dict[str, dict[str, set[str]]] = defaultdict(
            lambda: defaultdict(set)
        )
        ratio_country_names: dict[str, dict[str, str]] = defaultdict(dict)
        ratio_source_countries: dict[str, dict[str, set[str]]] = defaultdict(
            lambda: defaultdict(set)
        )
        ratio_country_category_offers: dict[
            str, dict[str, dict[str, dict[str, list[dict[str, Any]]]]]
        ] = defaultdict(lambda: defaultdict(lambda: defaultdict(lambda: defaultdict(list))))

        for row in rows:
            category_id = row["category_id"]
            if not category_id:
                continue

            matched_ratio = selector.match_ratio(row.get("size_cm"), row.get("size_inches"))
            dims = selector.parse_size_dims(row.get("size_cm"), row.get("size_inches"))
            if not matched_ratio or dims is None:
                continue

            country_code = (row.get("destination_country") or "").upper()
            if not country_code:
                continue

            size_label = dims.label
            ratio_category_countries[matched_ratio][category_id].add(country_code)
            self._remember_country_name(
                ratio_country_names[matched_ratio],
                country_code,
                row.get("destination_country_name"),
            )

            source_country = (row.get("source_country") or "").upper()
            if source_country:
                ratio_source_countries[matched_ratio][category_id].add(source_country)

            offer = {
                "sku": row["sku"],
                "variant_key": row.get("variant_key"),
                "size_cm": row.get("size_cm"),
                "size_inches": row.get("size_inches"),
                "source_country": source_country or None,
                "destination_country": country_code,
                "destination_country_name": ratio_country_names[matched_ratio].get(
                    country_code,
                    country_code,
                ),
                "product_price": self._to_float(row.get("product_price")),
                "shipping_price": self._to_float(row.get("shipping_price")),
                "total_cost": round(
                    self._to_float(row.get("product_price"))
                    + self._to_float(row.get("shipping_price")),
                    2,
                ),
                "currency": row.get("product_currency") or row.get("shipping_currency") or "EUR",
                "delivery_days": self._format_delivery_days(
                    row.get("min_shipping_days"),
                    row.get("max_shipping_days"),
                ),
                "shipping_method": row.get("shipping_method"),
                "service_name": row.get("service_name"),
                "service_level": row.get("service_level"),
                "min_shipping_days": row.get("min_shipping_days"),
                "max_shipping_days": row.get("max_shipping_days"),
            }

            ratio_country_category_offers[matched_ratio][country_code][category_id][
                size_label
            ].append(offer)

        ratio_cards: list[dict[str, Any]] = []
        by_ratio: dict[str, dict[str, Any]] = {}
        internals_by_ratio: dict[str, dict[str, Any]] = {}
        country_names_all: dict[str, str] = {}

        for ratio in ratio_lookup:
            ratio_category_slots = {
                category["id"]: global_shortlists.get(ratio, {}).get(category["id"], [])
                for category in category_defs
            }
            ratio_fulfillment = fulfillment_summary.get(ratio, {})

            available_countries = sorted(country_shortlists.get(ratio, {}).keys())
            countries: list[dict[str, str]] = []
            country_rows: list[dict[str, Any]] = []

            for country_code in available_countries:
                country_name = ratio_country_names[ratio].get(country_code, country_code)
                country_names_all[country_code] = country_name
                countries.append({"country_code": country_code, "country_name": country_name})

                cells = []
                available_count = 0
                total_size_count = 0
                primary_count = 0
                notice_count = 0
                for category in category_defs:
                    fulfillment_cell = ratio_fulfillment.get(country_code, {}).get(
                        category["id"],
                        self.fulfillment_policy.build_empty_country_category_summary(country_code),
                    )
                    country_slots = (
                        country_shortlists.get(ratio, {})
                        .get(country_code, {})
                        .get(
                            category["id"],
                            [],
                        )
                    )
                    size_count = sum(1 for item in country_slots if item["available"])
                    is_available = size_count > 0
                    if is_available:
                        available_count += 1
                        total_size_count += size_count
                    if fulfillment_cell["storefront_action"] == "show":
                        primary_count += 1
                    elif fulfillment_cell["storefront_action"] == "show_with_notice":
                        notice_count += 1
                    cells.append(
                        {
                            "category_id": category["id"],
                            "status": "available" if is_available else "missing",
                            "size_count": size_count,
                            "fulfillment": fulfillment_cell,
                        }
                    )

                if available_count == len(category_defs):
                    completion_status = "full"
                elif available_count > 0:
                    completion_status = "partial"
                else:
                    completion_status = "missing"

                country_rows.append(
                    {
                        "country_code": country_code,
                        "country_name": country_name,
                        "available_category_count": available_count,
                        "completion_status": completion_status,
                        "completion_percent": round(available_count / len(category_defs) * 100),
                        "total_size_count": total_size_count,
                        "primary_category_count": primary_count,
                        "notice_category_count": notice_count,
                        "cells": cells,
                    }
                )

            country_rows.sort(
                key=lambda item: (
                    0
                    if item["completion_status"] == "full"
                    else 1
                    if item["completion_status"] == "partial"
                    else 2,
                    item["country_name"],
                )
            )
            countries.sort(key=lambda item: item["country_name"])

            category_previews = []
            available_category_count = 0
            for category in category_defs:
                category_fulfillment_rows = [
                    ratio_fulfillment.get(country_code, {}).get(
                        category["id"],
                        self.fulfillment_policy.build_empty_country_category_summary(country_code),
                    )
                    for country_code in available_countries
                ]
                size_slots = ratio_category_slots.get(category["id"], [])
                if size_slots:
                    available_category_count += 1
                category_previews.append(
                    {
                        "category_id": category["id"],
                        "label": category["label"],
                        "short_label": category["short_label"],
                        "material_label": category["material_label"],
                        "frame_label": category["frame_label"],
                        "available": bool(size_slots),
                        "available_size_count": len(size_slots),
                        "country_coverage_count": len(
                            ratio_category_countries.get(ratio, {}).get(category["id"], set())
                        ),
                        "source_countries": sorted(
                            ratio_source_countries.get(ratio, {}).get(category["id"], set())
                        ),
                        "storefront_policy": policy_summary.get(category["id"]),
                        "fulfillment_summary": self.fulfillment_policy.summarize_category(
                            category_fulfillment_rows
                        ),
                        "recommended_size_labels": [
                            item["recommended_size_label"] for item in size_slots
                        ],
                        "size_slots": size_slots,
                    }
                )

            full_count = sum(1 for item in country_rows if item["completion_status"] == "full")
            partial_count = sum(
                1 for item in country_rows if item["completion_status"] == "partial"
            )

            by_ratio[ratio] = {
                "ratio": ratio,
                "ratio_meta": ratio_lookup[ratio],
                "available_category_count": available_category_count,
                "countries": countries,
                "country_rows": country_rows,
                "category_previews": category_previews,
                "full_country_count": full_count,
                "partial_country_count": partial_count,
            }
            internals_by_ratio[ratio] = {
                "ratio_category_slots": ratio_category_slots,
                "country_slots": country_shortlists.get(ratio, {}),
                "country_offers": ratio_country_category_offers.get(ratio, {}),
                "country_names": ratio_country_names.get(ratio, {}),
                "country_fulfillment": ratio_fulfillment,
            }

            ratio_cards.append(
                {
                    "ratio": ratio,
                    "title": ratio_lookup[ratio]["title"],
                    "description": ratio_lookup[ratio]["description"],
                    "available_category_count": available_category_count,
                    "country_count": len(country_rows),
                    "full_country_count": full_count,
                    "partial_country_count": partial_count,
                }
            )

        ratio_cards.sort(key=lambda item: ratio_lookup[item["ratio"]]["sort_order"])
        return {
            "ratio_cards": ratio_cards,
            "by_ratio": by_ratio,
            "internals_by_ratio": internals_by_ratio,
            "country_count": len(country_names_all),
            "curated_route_count": len(rows),
        }

    def _empty_ratio_preview(
        self,
        ratio: str,
        category_defs: list[dict[str, Any]],
    ) -> dict[str, Any]:
        empty_policy_summary = self.storefront_policy.build_policy_summary(
            kept_by_category={},
            removed_by_category={},
        )
        return {
            "ratio": ratio,
            "ratio_meta": {"label": ratio, "title": ratio, "description": ""},
            "available_category_count": 0,
            "countries": [],
            "country_rows": [],
            "category_previews": [
                {
                    "category_id": item["id"],
                    "label": item["label"],
                    "short_label": item["short_label"],
                    "material_label": item["material_label"],
                    "frame_label": item["frame_label"],
                    "available": False,
                    "available_size_count": 0,
                    "country_coverage_count": 0,
                    "source_countries": [],
                    "storefront_policy": empty_policy_summary.get(item["id"]),
                    "fulfillment_summary": self.fulfillment_policy.summarize_category([]),
                    "recommended_size_labels": [],
                    "size_slots": [],
                }
                for item in category_defs
            ],
            "full_country_count": 0,
            "partial_country_count": 0,
        }

    def _empty_country_preview(
        self,
        country_code: str,
        category_defs: list[dict[str, Any]],
    ) -> dict[str, Any]:
        return {
            "country_code": country_code,
            "country_name": country_code,
            "category_rows": [
                {
                    "category_id": item["id"],
                    "label": item["label"],
                    "short_label": item["short_label"],
                    "material_label": item["material_label"],
                    "frame_label": item["frame_label"],
                    "fulfillment_policy": self.fulfillment_policy.build_empty_country_category_summary(
                        country_code
                    ),
                    "baseline_sizes": [],
                    "available_size_count": 0,
                    "size_cells": [],
                    "sample_offers": [],
                }
                for item in category_defs
            ],
        }

    def _build_country_preview(
        self,
        ratio: str,
        country_code: str,
        country_name: str,
        category_defs: list[dict[str, Any]],
        ratio_category_slots: dict[str, list[dict[str, Any]]],
        country_slots: dict[str, list[dict[str, Any]]],
        country_offers: dict[str, dict[str, list[dict[str, Any]]]],
        country_fulfillment: dict[str, dict[str, Any]],
    ) -> dict[str, Any]:
        category_rows = []
        for category in category_defs:
            category_id = category["id"]
            fulfillment_policy = country_fulfillment.get(
                category_id,
                self.fulfillment_policy.build_empty_country_category_summary(country_code),
            )
            ratio_slots = ratio_category_slots.get(category_id, [])
            slot_by_label = {
                item["slot_size_label"]: item for item in country_slots.get(category_id, [])
            }

            size_cells = []
            sample_offers = []
            available_size_count = 0

            for ratio_slot in ratio_slots:
                slot_size_label = ratio_slot["recommended_size_label"]
                country_slot = slot_by_label.get(
                    slot_size_label,
                    {
                        "slot_size_label": slot_size_label,
                        "size_label": slot_size_label,
                        "available": False,
                        "centroid_size_label": ratio_slot["centroid_size_label"],
                        "member_size_labels": ratio_slot["member_size_labels"],
                        "country_count": ratio_slot["country_count"],
                    },
                )

                exact_size_label = country_slot["size_label"]
                shipping_selection = self.shipping_policy.select_storefront_offer(
                    country_offers.get(category_id, {}).get(exact_size_label, []),
                    country_code,
                )
                offer = shipping_selection["default_offer"]
                available = country_slot["available"] and offer is not None
                if available:
                    available_size_count += 1
                    sample_offers.append(offer)

                size_cells.append(
                    {
                        "slot_size_label": slot_size_label,
                        "size_label": exact_size_label,
                        "available": available,
                        "is_exact_match": exact_size_label == slot_size_label,
                        "centroid_size_label": country_slot["centroid_size_label"],
                        "member_size_labels": country_slot["member_size_labels"],
                        "offer": (
                            {
                                **offer,
                                "default_shipping_tier": shipping_selection["default_shipping_tier"],
                                "shipping_profiles": shipping_selection["shipping_profiles"],
                                "available_shipping_tiers": shipping_selection[
                                    "available_shipping_tiers"
                                ],
                            }
                            if available
                            else None
                        ),
                    }
                )

            category_rows.append(
                {
                    "category_id": category_id,
                    "label": category["label"],
                    "short_label": category["short_label"],
                    "material_label": category["material_label"],
                    "frame_label": category["frame_label"],
                    "fulfillment_policy": fulfillment_policy,
                    "baseline_sizes": [item["recommended_size_label"] for item in ratio_slots],
                    "available_size_count": available_size_count,
                    "size_cells": size_cells,
                    "sample_offers": sample_offers[:12],
                }
            )

        return {
            "ratio": ratio,
            "country_code": country_code,
            "country_name": country_name,
            "category_rows": category_rows,
        }

    def _normalize_paper_material(self, selected_paper_material: str | None) -> str:
        valid_materials = {item["id"] for item in PAPER_MATERIAL_OPTIONS}
        if selected_paper_material in valid_materials:
            return selected_paper_material
        return DEFAULT_PAPER_MATERIAL

    def _get_material_label(self, material_id: str) -> str:
        for item in PAPER_MATERIAL_OPTIONS:
            if item["id"] == material_id:
                return item["label"]
        return material_id.replace("_", " ").title()

    def get_category_defs(self, paper_material: str) -> list[dict[str, Any]]:
        material_label = self._get_material_label(paper_material)
        paper_categories = [
            {
                **category,
                "material": paper_material,
                "material_label": material_label,
            }
            for category in PAPER_CATEGORY_TEMPLATES
        ]
        return [*paper_categories, *CANVAS_CATEGORY_DEFS]

    def _to_float(self, value: Any) -> float:
        if value is None:
            return 0.0
        return round(float(value), 2)

    def _remember_country_name(
        self,
        country_names: dict[str, str],
        country_code: str,
        proposed_name: str | None,
    ) -> None:
        candidate = (proposed_name or country_code).strip()
        current = country_names.get(country_code)
        if current is None:
            country_names[country_code] = candidate
            return
        if len(candidate) > 3 and len(current) <= 3:
            country_names[country_code] = candidate

    def _format_delivery_days(self, min_days: Any, max_days: Any) -> str | None:
        if min_days is None and max_days is None:
            return None
        if min_days == max_days:
            return f"{min_days} days"
        if min_days is None:
            return f"up to {max_days} days"
        if max_days is None:
            return f"{min_days}+ days"
        return f"{min_days}-{max_days} days"
