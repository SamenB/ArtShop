from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from src.integrations.prodigi.catalog_pipeline.curated_source import (
    ProdigiCuratedCsvSource,
    ProdigiCuratedCsvSourceStats,
)
from src.integrations.prodigi.catalog_pipeline.planner import ProdigiCatalogSnapshotPlanner
from src.integrations.prodigi.services.prodigi_business_policy import (
    ProdigiBusinessPolicyService,
)
from src.integrations.prodigi.services.prodigi_catalog_preview import (
    DEFAULT_RATIO_PRESETS,
    ProdigiCatalogPreviewService,
)
from src.integrations.prodigi.services.prodigi_storefront_bake import (
    ProdigiStorefrontBakeService,
)
from src.integrations.prodigi.services.sizing.selector import ProdigiSizeSelectorService

PIPELINE_VERSION = "curated_csv_storefront_v1"


@dataclass(slots=True)
class ProdigiCatalogPipelineContext:
    """Shared dependency context for all curated CSV snapshot/payload paths."""

    db: Any
    source: ProdigiCuratedCsvSource
    source_stats: ProdigiCuratedCsvSourceStats
    preview_service: ProdigiCatalogPreviewService
    bake_service: ProdigiStorefrontBakeService
    paper_material: str
    ratio_presets: list[dict[str, Any]]
    category_defs: list[dict[str, Any]]
    selector: ProdigiSizeSelectorService
    pipeline_version: str = PIPELINE_VERSION
    policy_version: str = ProdigiBusinessPolicyService.POLICY_VERSION

    @classmethod
    async def create(
        cls,
        db: Any,
        *,
        curated_csv_path: str | Path | None = None,
        selected_paper_material: str | None = None,
    ) -> "ProdigiCatalogPipelineContext":
        source = ProdigiCuratedCsvSource(csv_path=curated_csv_path)
        source_stats = source.describe()

        preview_service = ProdigiCatalogPreviewService(db)
        await preview_service.load_storefront_settings()
        paper_material = preview_service._normalize_paper_material(selected_paper_material)
        ratio_presets = await preview_service._get_ratio_presets()
        if not ratio_presets:
            ratio_presets = list(DEFAULT_RATIO_PRESETS)

        selector = ProdigiSizeSelectorService(
            ratio_labels=[item["label"] for item in ratio_presets]
        )
        category_defs = preview_service.get_category_defs(paper_material)

        bake_service = ProdigiStorefrontBakeService(db)
        await bake_service.load_storefront_settings()

        return cls(
            db=db,
            source=source,
            source_stats=source_stats,
            preview_service=preview_service,
            bake_service=bake_service,
            paper_material=paper_material,
            ratio_presets=ratio_presets,
            category_defs=category_defs,
            selector=selector,
        )

    def build_planner(self) -> ProdigiCatalogSnapshotPlanner:
        return ProdigiCatalogSnapshotPlanner(
            category_defs=self.category_defs,
            selector=self.selector,
            preview_service=self.preview_service,
            storefront_policy=self.preview_service.storefront_policy,
            fulfillment_policy=self.preview_service.fulfillment_policy,
            shipping_policy=self.preview_service.shipping_policy,
        )

    def source_payload(self) -> dict[str, Any]:
        return {
            "path": self.source_stats.path,
            "files_seen": self.source_stats.files_seen,
            "rows_seen": self.source_stats.rows_seen,
            "size_bytes": self.source_stats.size_bytes,
            "sha256": self.source_stats.sha256,
            "pipeline_version": self.pipeline_version,
            "policy_version": self.policy_version,
        }
