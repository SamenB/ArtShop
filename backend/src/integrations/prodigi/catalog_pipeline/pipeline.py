from __future__ import annotations

from pathlib import Path
from typing import Any

from src.integrations.prodigi.catalog_pipeline.baker import ProdigiCatalogSnapshotBaker
from src.integrations.prodigi.catalog_pipeline.curated_source import ProdigiCuratedCsvSource
from src.integrations.prodigi.catalog_pipeline.materializer import (
    ProdigiCatalogPayloadMaterializer,
)
from src.integrations.prodigi.catalog_pipeline.planner import ProdigiCatalogSnapshotPlanner
from src.integrations.prodigi.services.prodigi_catalog_preview import (
    DEFAULT_PAPER_MATERIAL,
    DEFAULT_RATIO_PRESETS,
    ProdigiCatalogPreviewService,
)
from src.integrations.prodigi.services.prodigi_fulfillment_policy import (
    ProdigiFulfillmentPolicyService,
)
from src.integrations.prodigi.services.prodigi_shipping_policy import ProdigiShippingPolicyService
from src.integrations.prodigi.services.prodigi_storefront_bake import ProdigiStorefrontBakeService
from src.integrations.prodigi.services.prodigi_storefront_policy import (
    ProdigiStorefrontPolicyService,
)
from src.integrations.prodigi.services.sizing.selector import ProdigiSizeSelectorService


class ProdigiCatalogPipeline:
    """
    Cohesive CSV -> planned storefront -> active bake -> artwork payload pipeline.

    Existing admin/task services should call this instead of owning CSV parsing,
    policy planning, database writing, and materialization in one class.
    """

    def __init__(self, db: Any, curated_csv_path: str | Path | None = None):
        self.db = db
        self.curated_csv_path = curated_csv_path
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
        source = ProdigiCuratedCsvSource(csv_path=self.curated_csv_path)
        source_stats = source.describe()
        paper_material = selected_paper_material or DEFAULT_PAPER_MATERIAL
        ratio_presets = await self.preview_service._get_ratio_presets()
        if not ratio_presets:
            ratio_presets = list(DEFAULT_RATIO_PRESETS)

        selector = ProdigiSizeSelectorService(
            ratio_labels=[item["label"] for item in ratio_presets]
        )
        category_defs = self.preview_service.get_category_defs(paper_material)
        planner = ProdigiCatalogSnapshotPlanner(
            category_defs=category_defs,
            selector=selector,
            preview_service=self.preview_service,
            storefront_policy=self.storefront_policy,
            fulfillment_policy=self.fulfillment_policy,
            shipping_policy=self.shipping_policy,
        )
        plan = planner.build_plan(source)
        size_plan = selector.build_size_plan_from_stats(
            ratio_category_size_stats=plan.ratio_category_size_stats,
            country_size_presence=plan.country_size_presence,
        )
        bake_result = await ProdigiCatalogSnapshotBaker(
            db=self.db,
            preview_service=self.preview_service,
            bake_service=self.bake_service,
            fulfillment_policy=self.fulfillment_policy,
            storefront_policy=self.storefront_policy,
        ).bake(
            plan=plan,
            size_plan=size_plan,
            ratio_presets=ratio_presets,
            category_defs=category_defs,
            paper_material=paper_material,
            include_notice_level=include_notice_level,
            selected_ratio=selected_ratio,
            selected_country=selected_country,
        )
        materialization = await ProdigiCatalogPayloadMaterializer(
            self.db
        ).materialize_active_bake()

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
            "csv_source": {
                "path": source_stats.path,
                "files_seen": source_stats.files_seen,
                "rows_seen": source_stats.rows_seen,
                "size_bytes": source_stats.size_bytes,
                "sha256": source_stats.sha256,
            },
            "streamed_rows_matched": plan.matched_row_count,
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
