"""
Read repository for imported Prodigi catalog data used by admin previews.

Unlike the CRUD repositories, this repository exposes curated analytical reads
that join products, variants, and routes into a preview-friendly row shape.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import text


class ProdigiCatalogRepository:
    """
    Read-only repository for imported Prodigi catalog tables.
    """

    def __init__(self, session):
        self.session = session

    async def get_curated_rows(self, category_defs: list[dict[str, Any]]) -> list[dict[str, Any]]:
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
                v.id AS variant_id,
                v.variant_key,
                v.color,
                v.frame,
                v.style,
                v.glaze,
                v.mount,
                v.mount_color,
                v.paper_type,
                v.wrap,
                v.edge,
                r.source_country,
                r.destination_country,
                COALESCE(NULLIF(r.destination_country_name, ''), r.destination_country) AS destination_country_name,
                r.shipping_method,
                r.service_name,
                r.service_level,
                r.tracked_shipping,
                r.product_price,
                r.product_currency,
                r.shipping_price,
                r.shipping_currency,
                r.min_shipping_days,
                r.max_shipping_days,
                CASE
                    {" ".join(case_conditions)}
                    ELSE NULL
                END AS category_id
            FROM prodigi_catalog_routes r
            JOIN prodigi_catalog_variants v ON v.id = r.variant_id
            JOIN prodigi_catalog_products p ON p.id = v.product_id
            WHERE r.destination_country IS NOT NULL
              AND ({" OR ".join(where_conditions)})
            """
        )

        result = await self.session.execute(query, params)
        return [dict(row) for row in result.mappings()]

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
