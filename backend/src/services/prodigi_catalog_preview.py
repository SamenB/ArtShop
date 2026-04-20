from __future__ import annotations

import math
import re
from collections import defaultdict
from typing import Any

from sqlalchemy import text

from src.utils.db_manager import DBManager


SIZE_PATTERN = re.compile(r"(?P<w>\d+(?:\.\d+)?)x(?P<h>\d+(?:\.\d+)?)")
RATIO_TOLERANCE = 0.02

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
        "id": "paperPrintBoxFramed",
        "label": "Paper Print Box Framed",
        "short_label": "Paper Box",
        "medium": "paper",
        "presentation_values": ("framed",),
        "frame_type_values": ("box_frame",),
        "frame_label": "Box frame",
        "sort_order": 1,
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
    def __init__(self, db: DBManager):
        self.db = db

    async def get_preview(
        self,
        selected_ratio: str | None = None,
        selected_country: str | None = None,
        selected_paper_material: str | None = None,
    ) -> dict[str, Any]:
        selected_paper_material = self._normalize_paper_material(selected_paper_material)
        category_defs = self._get_category_defs(selected_paper_material)
        ratio_presets = await self._get_ratio_presets()
        if not ratio_presets:
            ratio_presets = list(DEFAULT_RATIO_PRESETS)

        selected_ratio = selected_ratio or ratio_presets[0]["label"]
        valid_ratios = {item["label"] for item in ratio_presets}
        if selected_ratio not in valid_ratios:
            selected_ratio = ratio_presets[0]["label"]

        rows = await self._fetch_curated_rows(category_defs)
        preview = self._build_preview(rows, ratio_presets, category_defs)
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
                ratio_category_baselines=selected_ratio_internal["ratio_category_baselines"],
                country_sizes=selected_ratio_internal["country_sizes"].get(selected_country, {}),
                country_offers=selected_ratio_internal["country_offers"].get(selected_country, {}),
            )
        else:
            selected_country_preview = self._empty_country_preview(selected_country, category_defs)

        return {
            "selected_ratio": selected_ratio,
            "selected_country": selected_country,
            "selected_paper_material": selected_paper_material,
            "ratios": ratio_presets,
            "paper_materials": list(PAPER_MATERIAL_OPTIONS),
            "categories": category_defs,
            "ratio_cards": preview["ratio_cards"],
            "selected_ratio_preview": selected_ratio_preview,
            "selected_country_preview": selected_country_preview,
            "country_count": preview["country_count"],
            "generated_from_curated_routes": preview["curated_route_count"],
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

    async def _fetch_curated_rows(self, category_defs: list[dict[str, Any]]) -> list[dict[str, Any]]:
        case_conditions = []
        where_conditions = []
        params: dict[str, Any] = {}

        for idx, category in enumerate(category_defs):
            prefix = f"c{idx}"
            predicate_parts = [
                f"v.normalized_medium = :{prefix}_medium",
                f"v.normalized_material = :{prefix}_material",
                self._build_in_predicate(
                    "v.normalized_presentation",
                    prefix,
                    "presentation",
                    category["presentation_values"],
                    params,
                ),
                self._build_in_predicate(
                    "v.normalized_frame_type",
                    prefix,
                    "frame_type",
                    category["frame_type_values"],
                    params,
                ),
            ]
            predicate_parts.extend(
                self._build_like_predicates(
                    prefix=prefix,
                    params=params,
                    include_sku_patterns=category.get("include_sku_patterns", ()),
                    exclude_sku_patterns=category.get("exclude_sku_patterns", ()),
                    include_description_patterns=category.get("include_description_patterns", ()),
                    exclude_description_patterns=category.get("exclude_description_patterns", ()),
                )
            )

            params[f"{prefix}_medium"] = category["medium"]
            params[f"{prefix}_material"] = category["material"]

            predicate = "(" + " AND ".join(predicate_parts) + ")"
            where_conditions.append(predicate)
            case_conditions.append(f"WHEN {predicate} THEN '{category['id']}'")

        query = text(
            f"""
            SELECT
                p.sku,
                p.size_cm,
                p.size_inches,
                p.product_type,
                p.product_description,
                v.variant_key,
                r.source_country,
                r.destination_country,
                COALESCE(NULLIF(r.destination_country_name, ''), r.destination_country) AS destination_country_name,
                r.product_price,
                r.product_currency,
                r.shipping_price,
                r.shipping_currency,
                r.min_shipping_days,
                r.max_shipping_days,
                CASE
                    {' '.join(case_conditions)}
                    ELSE NULL
                END AS category_id
            FROM prodigi_catalog_routes r
            JOIN prodigi_catalog_variants v ON v.id = r.variant_id
            JOIN prodigi_catalog_products p ON p.id = v.product_id
            WHERE r.destination_country IS NOT NULL
              AND ({' OR '.join(where_conditions)})
            """
        )

        result = await self.db.session.execute(query, params)
        return [dict(row) for row in result.mappings()]

    def _build_preview(
        self,
        rows: list[dict[str, Any]],
        ratio_presets: list[dict[str, Any]],
        category_defs: list[dict[str, Any]],
    ) -> dict[str, Any]:
        ratio_lookup = {item["label"]: item for item in ratio_presets}
        internals_by_ratio: dict[str, dict[str, Any]] = {}
        ratio_category_sizes: dict[str, dict[str, set[str]]] = defaultdict(
            lambda: defaultdict(set)
        )
        ratio_category_countries: dict[str, dict[str, set[str]]] = defaultdict(
            lambda: defaultdict(set)
        )
        ratio_country_category_sizes: dict[str, dict[str, dict[str, set[str]]]] = defaultdict(
            lambda: defaultdict(lambda: defaultdict(set))
        )
        ratio_country_names: dict[str, dict[str, str]] = defaultdict(dict)
        ratio_source_countries: dict[str, dict[str, set[str]]] = defaultdict(
            lambda: defaultdict(set)
        )
        ratio_country_category_offers: dict[str, dict[str, dict[str, dict[str, dict[str, Any]]]]] = defaultdict(
            lambda: defaultdict(lambda: defaultdict(dict))
        )

        for row in rows:
            category_id = row["category_id"]
            if not category_id:
                continue

            matched_ratio = self._match_ratio(
                row.get("size_cm"),
                row.get("size_inches"),
                ratio_lookup.keys(),
            )
            if not matched_ratio:
                continue

            country_code = (row.get("destination_country") or "").upper()
            if not country_code:
                continue

            size_label = self._clean_size_label(
                row.get("size_cm"),
                row.get("size_inches"),
                row["sku"],
            )
            ratio_category_sizes[matched_ratio][category_id].add(size_label)
            ratio_category_countries[matched_ratio][category_id].add(country_code)
            ratio_country_category_sizes[matched_ratio][country_code][category_id].add(size_label)
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
                    self._to_float(row.get("product_price")) + self._to_float(row.get("shipping_price")),
                    2,
                ),
                "currency": row.get("product_currency") or row.get("shipping_currency") or "EUR",
                "delivery_days": self._format_delivery_days(
                    row.get("min_shipping_days"),
                    row.get("max_shipping_days"),
                ),
                "min_shipping_days": row.get("min_shipping_days"),
                "max_shipping_days": row.get("max_shipping_days"),
            }

            current = ratio_country_category_offers[matched_ratio][country_code][category_id].get(size_label)
            if current is None or self._is_better_offer(current, offer, country_code):
                ratio_country_category_offers[matched_ratio][country_code][category_id][size_label] = offer

        ratio_cards: list[dict[str, Any]] = []
        by_ratio: dict[str, dict[str, Any]] = {}
        country_names_all: dict[str, str] = {}

        for ratio in ratio_lookup:
            ratio_category_baselines = {
                category["id"]: sorted(
                    ratio_category_sizes.get(ratio, {}).get(category["id"], set()),
                    key=self._size_sort_key,
                )
                for category in category_defs
            }

            country_rows: list[dict[str, Any]] = []
            countries: list[dict[str, str]] = []
            available_countries = ratio_country_category_sizes.get(ratio, {})

            for country_code, categories in sorted(available_countries.items()):
                country_name = ratio_country_names[ratio].get(country_code, country_code)
                country_names_all[country_code] = country_name
                countries.append({"country_code": country_code, "country_name": country_name})

                cells = []
                available_count = 0
                total_size_count = 0
                for category in category_defs:
                    size_count = len(categories.get(category["id"], set()))
                    is_available = size_count > 0
                    if is_available:
                        available_count += 1
                        total_size_count += size_count
                    cells.append(
                        {
                            "category_id": category["id"],
                            "status": "available" if is_available else "missing",
                            "size_count": size_count,
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
                        "cells": cells,
                    }
                )

            country_rows.sort(
                key=lambda item: (
                    0 if item["completion_status"] == "full" else 1 if item["completion_status"] == "partial" else 2,
                    item["country_name"],
                )
            )
            countries.sort(key=lambda item: item["country_name"])

            category_previews = []
            available_category_count = 0
            for category in category_defs:
                size_labels = ratio_category_baselines[category["id"]]
                if size_labels:
                    available_category_count += 1
                category_previews.append(
                    {
                        "category_id": category["id"],
                        "label": category["label"],
                        "short_label": category["short_label"],
                        "material_label": category["material_label"],
                        "frame_label": category["frame_label"],
                        "available": bool(size_labels),
                        "available_size_count": len(size_labels),
                        "country_coverage_count": len(
                            ratio_category_countries.get(ratio, {}).get(category["id"], set())
                        ),
                        "source_countries": sorted(
                            ratio_source_countries.get(ratio, {}).get(category["id"], set())
                        ),
                        "size_labels": size_labels,
                    }
                )

            full_count = sum(1 for item in country_rows if item["completion_status"] == "full")
            partial_count = sum(1 for item in country_rows if item["completion_status"] == "partial")

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
                "ratio_category_baselines": ratio_category_baselines,
                "country_sizes": ratio_country_category_sizes.get(ratio, {}),
                "country_offers": ratio_country_category_offers.get(ratio, {}),
                "country_names": ratio_country_names.get(ratio, {}),
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
                    "size_labels": [],
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
        ratio_category_baselines: dict[str, list[str]],
        country_sizes: dict[str, set[str]],
        country_offers: dict[str, dict[str, dict[str, Any]]],
    ) -> dict[str, Any]:
        category_rows = []
        for category in category_defs:
            category_id = category["id"]
            baseline_sizes = ratio_category_baselines.get(category_id, [])
            available_sizes = country_sizes.get(category_id, set())
            size_cells = []
            sample_offers = []

            for size_label in baseline_sizes:
                offer = country_offers.get(category_id, {}).get(size_label)
                available = size_label in available_sizes and offer is not None
                size_cells.append(
                    {
                        "size_label": size_label,
                        "available": available,
                        "offer": offer if available else None,
                    }
                )
                if available and offer is not None:
                    sample_offers.append(offer)

            category_rows.append(
                {
                    "category_id": category_id,
                    "label": category["label"],
                    "short_label": category["short_label"],
                    "material_label": category["material_label"],
                    "frame_label": category["frame_label"],
                    "baseline_sizes": baseline_sizes,
                    "available_size_count": len(available_sizes),
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

    def _get_category_defs(self, paper_material: str) -> list[dict[str, Any]]:
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

    def _build_in_predicate(
        self,
        column_name: str,
        prefix: str,
        value_name: str,
        values: tuple[str | None, ...],
        params: dict[str, Any],
    ) -> str:
        parts = []
        non_null_values = [value for value in values if value is not None]
        if non_null_values:
            param_names = []
            for idx, value in enumerate(non_null_values):
                key = f"{prefix}_{value_name}_{idx}"
                params[key] = value
                param_names.append(f":{key}")
            parts.append(f"{column_name} IN ({', '.join(param_names)})")
        if any(value is None for value in values):
            parts.append(f"{column_name} IS NULL")
        return "(" + " OR ".join(parts) + ")"

    def _build_like_predicates(
        self,
        prefix: str,
        params: dict[str, Any],
        include_sku_patterns: tuple[str, ...],
        exclude_sku_patterns: tuple[str, ...],
        include_description_patterns: tuple[str, ...],
        exclude_description_patterns: tuple[str, ...],
    ) -> list[str]:
        predicates: list[str] = []
        predicates.extend(
            self._build_pattern_predicates(
                column_name="p.sku",
                prefix=prefix,
                value_name="sku_include",
                patterns=include_sku_patterns,
                params=params,
                negate=False,
            )
        )
        predicates.extend(
            self._build_pattern_predicates(
                column_name="p.sku",
                prefix=prefix,
                value_name="sku_exclude",
                patterns=exclude_sku_patterns,
                params=params,
                negate=True,
            )
        )
        predicates.extend(
            self._build_pattern_predicates(
                column_name="COALESCE(p.product_description, '')",
                prefix=prefix,
                value_name="description_include",
                patterns=include_description_patterns,
                params=params,
                negate=False,
            )
        )
        predicates.extend(
            self._build_pattern_predicates(
                column_name="COALESCE(p.product_description, '')",
                prefix=prefix,
                value_name="description_exclude",
                patterns=exclude_description_patterns,
                params=params,
                negate=True,
            )
        )
        return predicates

    def _build_pattern_predicates(
        self,
        column_name: str,
        prefix: str,
        value_name: str,
        patterns: tuple[str, ...],
        params: dict[str, Any],
        negate: bool,
    ) -> list[str]:
        predicates: list[str] = []
        for idx, pattern in enumerate(patterns):
            key = f"{prefix}_{value_name}_{idx}"
            params[key] = f"%{pattern}%"
            operator = "NOT ILIKE" if negate else "ILIKE"
            predicates.append(f"{column_name} {operator} :{key}")
        return predicates

    def _match_ratio(
        self,
        size_cm: str | None,
        size_inches: str | None,
        ratio_labels: Any,
    ) -> str | None:
        dimensions = []
        for candidate in (size_cm, size_inches):
            match = SIZE_PATTERN.search(candidate or "")
            if match:
                dimensions.append((float(match.group("w")), float(match.group("h"))))

        if not dimensions:
            return None

        best_ratio = None
        best_delta = None
        for width, height in dimensions:
            short_edge, long_edge = sorted((width, height))
            actual_ratio = short_edge / long_edge if long_edge else 0
            for label in ratio_labels:
                left, right = label.split(":")
                target_ratio = int(left) / int(right)
                delta = abs(actual_ratio - target_ratio)
                if best_delta is None or delta < best_delta:
                    best_delta = delta
                    best_ratio = label

        if best_delta is not None and best_delta <= RATIO_TOLERANCE:
            return best_ratio
        return None

    def _clean_size_label(
        self,
        size_cm: str | None,
        size_inches: str | None,
        fallback: str,
    ) -> str:
        for candidate in (size_cm, size_inches):
            if candidate and SIZE_PATTERN.search(candidate):
                return candidate.replace('"', "").strip()
        return fallback

    def _size_sort_key(self, value: str) -> tuple[float, float, str]:
        match = SIZE_PATTERN.search(value)
        if not match:
            return (math.inf, math.inf, value)
        width = float(match.group("w"))
        height = float(match.group("h"))
        short_edge, long_edge = sorted((width, height))
        return (short_edge * long_edge, long_edge, value)

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

    def _is_better_offer(
        self,
        current: dict[str, Any],
        candidate: dict[str, Any],
        destination_country: str,
    ) -> bool:
        return self._offer_rank(candidate, destination_country) < self._offer_rank(
            current,
            destination_country,
        )

    def _offer_rank(self, offer: dict[str, Any], destination_country: str) -> tuple[Any, ...]:
        source_country = offer.get("source_country") or "ZZ"
        return (
            0 if source_country == destination_country else 1,
            offer.get("max_shipping_days") if offer.get("max_shipping_days") is not None else 9999,
            offer.get("min_shipping_days") if offer.get("min_shipping_days") is not None else 9999,
            source_country,
            offer.get("currency") or "ZZZ",
            offer.get("total_cost") or 0,
        )

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
