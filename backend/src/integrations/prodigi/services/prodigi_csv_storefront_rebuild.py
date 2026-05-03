from __future__ import annotations

from pathlib import Path
from typing import Any

from src.integrations.prodigi.catalog_pipeline.pipeline import ProdigiCatalogPipeline


class ProdigiCsvStorefrontRebuildService:
    """
    Compatibility facade for rebuilding the active Prodigi storefront snapshot.

    The actual CSV/source, parser, planning, bake writing, and payload
    materialization layers live under integrations.prodigi.catalog_pipeline.
    """

    def __init__(
        self,
        db: Any,
        csv_root: str | Path | None = None,
        curated_csv_path: str | Path | None = None,
    ):
        # csv_root is kept only for older callers; it now means curated CSV path.
        self.pipeline = ProdigiCatalogPipeline(
            db,
            curated_csv_path=curated_csv_path or csv_root,
        )

    async def rebuild(
        self,
        *,
        selected_ratio: str | None = None,
        selected_country: str | None = None,
        selected_paper_material: str | None = None,
        include_notice_level: bool = True,
    ) -> dict[str, Any]:
        return await self.pipeline.rebuild(
            selected_ratio=selected_ratio,
            selected_country=selected_country,
            selected_paper_material=selected_paper_material,
            include_notice_level=include_notice_level,
        )
