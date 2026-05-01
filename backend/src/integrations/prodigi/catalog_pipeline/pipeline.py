from __future__ import annotations

from pathlib import Path
from typing import Any

from src.config import settings
from src.integrations.prodigi.catalog_pipeline.baker import ProdigiCatalogSnapshotBaker
from src.integrations.prodigi.catalog_pipeline.context import ProdigiCatalogPipelineContext
from src.integrations.prodigi.catalog_pipeline.materializer import (
    ProdigiCatalogPayloadMaterializer,
)
from src.integrations.prodigi.catalog_pipeline.retention import (
    ProdigiStorefrontBakeRetentionService,
)


class ProdigiCatalogPipeline:
    """
    Cohesive CSV -> planned storefront -> active bake -> artwork payload pipeline.

    Existing admin/task services should call this instead of owning CSV parsing,
    policy planning, database writing, and materialization in one class.
    """

    def __init__(self, db: Any, curated_csv_path: str | Path | None = None):
        self.db = db
        self.curated_csv_path = curated_csv_path

    async def build_dataset(
        self,
        *,
        selected_paper_material: str | None = None,
    ) -> dict[str, Any]:
        context = await ProdigiCatalogPipelineContext.create(
            self.db,
            curated_csv_path=self.curated_csv_path,
            selected_paper_material=selected_paper_material,
        )
        return self._build_dataset_from_context(context)

    def _build_dataset_from_context(
        self,
        context: ProdigiCatalogPipelineContext,
    ) -> dict[str, Any]:
        planner = context.build_planner()
        plan = planner.build_plan(context.source, collect_preview_rows=True)
        size_plan = context.selector.build_size_plan_from_stats(
            ratio_category_size_stats=plan.ratio_category_size_stats,
            country_size_presence=plan.country_size_presence,
        )
        preview = self._build_preview_from_plan(context, plan, size_plan)
        return {
            "selected_paper_material": context.paper_material,
            "category_defs": context.category_defs,
            "ratio_presets": context.ratio_presets,
            "preview": preview,
            "policy_filtered_out_routes": sum(plan.removed_by_category.values()),
            "csv_source": context.source_payload(),
        }

    async def preview(
        self,
        *,
        selected_ratio: str | None = None,
        selected_country: str | None = None,
        selected_paper_material: str | None = None,
        include_notice_level: bool = True,
    ) -> dict[str, Any]:
        context = await ProdigiCatalogPipelineContext.create(
            self.db,
            curated_csv_path=self.curated_csv_path,
            selected_paper_material=selected_paper_material,
        )
        dataset = self._build_dataset_from_context(context)
        selection = context.preview_service.resolve_selection(
            preview=dataset["preview"],
            ratio_presets=dataset["ratio_presets"],
            category_defs=dataset["category_defs"],
            selected_ratio=selected_ratio,
            selected_country=selected_country,
        )
        preview_payload = {
            "selected_ratio": selection["selected_ratio"],
            "selected_country": selection["selected_country"],
            "selected_ratio_preview": selection["selected_ratio_preview"],
            "selected_country_preview": selection["selected_country_preview"],
        }
        storefront_preview = context.bake_service.build_storefront_country_preview(
            preview_payload=preview_payload,
            include_notice_level=include_notice_level,
        )

        return {
            "selected_ratio": selection["selected_ratio"],
            "selected_country": selection["selected_country"],
            "selected_paper_material": dataset["selected_paper_material"],
            "ratios": dataset["ratio_presets"],
            "paper_materials": context.preview_service.get_paper_material_options(),
            "categories": dataset["category_defs"],
            "ratio_cards": dataset["preview"]["ratio_cards"],
            "selected_ratio_preview": selection["selected_ratio_preview"],
            "selected_country_preview": selection["selected_country_preview"],
            "selected_country_storefront_preview": storefront_preview,
            "storefront_mode": "include_notice_level" if include_notice_level else "primary_only",
            "country_count": dataset["preview"]["country_count"],
            "generated_from_curated_routes": dataset["preview"]["curated_route_count"],
            "policy_filtered_out_routes": dataset["policy_filtered_out_routes"],
            "csv_source": dataset["csv_source"],
        }

    async def rebuild(
        self,
        *,
        selected_ratio: str | None = None,
        selected_country: str | None = None,
        selected_paper_material: str | None = None,
        include_notice_level: bool = True,
    ) -> dict[str, Any]:
        context = await ProdigiCatalogPipelineContext.create(
            self.db,
            curated_csv_path=self.curated_csv_path,
            selected_paper_material=selected_paper_material,
        )
        planner = context.build_planner()
        plan = planner.build_plan(context.source)
        size_plan = context.selector.build_size_plan_from_stats(
            ratio_category_size_stats=plan.ratio_category_size_stats,
            country_size_presence=plan.country_size_presence,
        )
        bake_result = await ProdigiCatalogSnapshotBaker(
            db=self.db,
            preview_service=context.preview_service,
            bake_service=context.bake_service,
            fulfillment_policy=context.preview_service.fulfillment_policy,
            storefront_policy=context.preview_service.storefront_policy,
        ).bake(
            plan=plan,
            size_plan=size_plan,
            ratio_presets=context.ratio_presets,
            category_defs=context.category_defs,
            paper_material=context.paper_material,
            include_notice_level=include_notice_level,
            selected_ratio=selected_ratio,
            selected_country=selected_country,
            source_payload=context.source_payload(),
        )
        materialization = await ProdigiCatalogPayloadMaterializer(
            self.db
        ).materialize_active_bake()
        retention = await ProdigiStorefrontBakeRetentionService(self.db).prune(
            keep_inactive=settings.PRODIGI_STOREFRONT_BAKE_RETENTION
        )

        bake = bake_result["bake"]
        selected_storefront_preview = bake_result["selected_storefront_preview"]
        selected_ratio_value = selected_ratio or (selected_storefront_preview or {}).get("ratio")
        selected_country_value = selected_country or (
            selected_storefront_preview or {}
        ).get("country_code")

        return {
            "status": "baked",
            "message": (
                "Storefront snapshot was rebuilt from the committed curated Prodigi "
                "CSV source with pixel-first provider validation."
            ),
            "csv_source": context.source_payload(),
            "streamed_rows_matched": plan.matched_row_count,
            "bake": {
                "id": bake.id,
                "bake_key": bake.bake_key,
                "paper_material": bake.paper_material,
                "include_notice_level": bake.include_notice_level,
                "source_sha256": bake.source_sha256,
                "source_row_count": bake.source_row_count,
                "source_size_bytes": bake.source_size_bytes,
                "pipeline_version": bake.pipeline_version,
                "policy_version": bake.policy_version,
                "ratio_count": bake.ratio_count,
                "country_count": bake.country_count,
                "offer_group_count": bake.offer_group_count,
                "offer_size_count": bake.offer_size_count,
            },
            "artwork_storefront_materialization": materialization,
            "retention": retention,
            "selected_ratio": selected_ratio_value,
            "selected_country": selected_country_value,
            "selected_country_storefront_preview": selected_storefront_preview,
        }

    def _build_preview_from_plan(
        self,
        context: ProdigiCatalogPipelineContext,
        plan: Any,
        size_plan: dict[str, Any],
    ) -> dict[str, Any]:
        policy_summary = context.preview_service.storefront_policy.build_policy_summary(
            kept_by_category=dict(plan.kept_by_category),
            removed_by_category=dict(plan.removed_by_category),
        )
        fulfillment_summary = self._build_fulfillment_summary(context, plan)
        return context.preview_service._build_preview(
            rows=plan.preview_rows or [],
            ratio_presets=context.ratio_presets,
            category_defs=context.category_defs,
            selector=context.selector,
            size_plan=size_plan,
            policy_summary=policy_summary,
            fulfillment_summary=fulfillment_summary,
        )

    def _build_fulfillment_summary(
        self,
        context: ProdigiCatalogPipelineContext,
        plan: Any,
    ) -> dict[str, dict[str, dict[str, Any]]]:
        summary: dict[str, dict[str, dict[str, Any]]] = {}
        for ratio, country_map in plan.fulfillment_buckets.items():
            summary[ratio] = {}
            for country_code, category_map in country_map.items():
                summary[ratio][country_code] = {}
                for category in context.category_defs:
                    category_id = category["id"]
                    payload = category_map.get(category_id)
                    if not payload:
                        summary[ratio][country_code][
                            category_id
                        ] = context.preview_service.fulfillment_policy.build_empty_country_category_summary(
                            country_code
                        )
                        continue
                    summary[ratio][country_code][
                        category_id
                    ] = context.preview_service.fulfillment_policy._build_country_category_summary(
                        destination_country=country_code,
                        source_countries=payload["source_countries"],
                        row_count=payload["row_count"],
                        fastest_min_shipping_days=payload["fastest_min_shipping_days"],
                        fastest_max_shipping_days=payload["fastest_max_shipping_days"],
                    )
        return summary
