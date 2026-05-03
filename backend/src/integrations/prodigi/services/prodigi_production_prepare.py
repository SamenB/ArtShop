from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from src.integrations.prodigi.catalog_pipeline.curated_source import ProdigiCuratedCsvSource
from src.integrations.prodigi.services.prodigi_business_policy import (
    ProdigiBusinessPolicyService,
)
from src.integrations.prodigi.services.prodigi_csv_storefront_rebuild import (
    ProdigiCsvStorefrontRebuildService,
)
from src.integrations.prodigi.services.prodigi_fulfillment_validation import (
    KEY_COUNTRIES,
    ProdigiFulfillmentValidationService,
    ValidationConfig,
    ValidationThresholds,
)
from src.integrations.prodigi.services.prodigi_runtime_cache import (
    clear_artwork_print_storefront_cache,
)


@dataclass(slots=True)
class ProdigiProductionPrepareOptions:
    skip_csv_rebuild: bool = False
    curated_csv: str | None = None
    selected_ratio: str | None = None
    selected_country: str | None = None
    selected_paper_material: str | None = None
    include_notice_level: bool = True
    country: list[str] | None = None
    ratio: list[str] | None = None
    category: list[str] | None = None
    max_sizes_per_group: int = 0
    simulate_orders: int = 1500
    batch_size: int = 3
    include_api_checks: bool = False
    include_quotes: bool = False
    require_api_checks: bool = False
    min_samples: int = 1
    min_simulated_orders: int = 1
    max_failures: int = 0
    min_pass_rate: float = 1.0
    output: str | None = None

    @classmethod
    def from_namespace(cls, args: Any) -> "ProdigiProductionPrepareOptions":
        return cls(
            skip_csv_rebuild=bool(args.skip_csv_rebuild),
            curated_csv=args.curated_csv,
            selected_ratio=args.selected_ratio,
            selected_country=args.selected_country,
            selected_paper_material=args.selected_paper_material,
            include_notice_level=not bool(args.strict_fulfillment_only),
            country=args.country,
            ratio=args.ratio,
            category=args.category,
            max_sizes_per_group=args.max_sizes_per_group,
            simulate_orders=args.simulate_orders,
            batch_size=args.batch_size,
            include_api_checks=bool(args.include_api_checks),
            include_quotes=bool(args.include_quotes),
            require_api_checks=bool(args.require_api_checks),
            min_samples=args.min_samples,
            min_simulated_orders=args.min_simulated_orders,
            max_failures=args.max_failures,
            min_pass_rate=args.min_pass_rate,
            output=args.output,
        )


class ProdigiProductionPrepareService:
    """Rebuild and validate production Prodigi storefront data from the curated CSV."""

    def __init__(self, db: Any):
        self.db = db

    async def run(self, options: ProdigiProductionPrepareOptions) -> dict[str, Any]:
        started_at = datetime.now(UTC)
        if not options.skip_csv_rebuild:
            assert_curated_csv_ready(options.curated_csv)

        rebuild_result = None
        if not options.skip_csv_rebuild:
            rebuild_result = await ProdigiCsvStorefrontRebuildService(
                self.db,
                curated_csv_path=options.curated_csv,
            ).rebuild(
                selected_ratio=options.selected_ratio,
                selected_country=options.selected_country,
                selected_paper_material=options.selected_paper_material,
                include_notice_level=options.include_notice_level,
            )

        validation = await ProdigiFulfillmentValidationService(self.db.session).run(
            ValidationConfig(
                countries=options.country or KEY_COUNTRIES,
                ratios=options.ratio or None,
                categories=options.category or None,
                max_sizes_per_group=options.max_sizes_per_group,
                simulate_orders=options.simulate_orders,
                batch_size=options.batch_size,
                include_api_checks=options.include_api_checks,
                include_quotes=options.include_quotes,
                thresholds=ValidationThresholds(
                    min_samples=options.min_samples,
                    min_simulated_orders=options.min_simulated_orders,
                    max_failures=options.max_failures,
                    min_pass_rate=options.min_pass_rate,
                    require_api_checks=options.require_api_checks,
                ),
                output_path=None,
            )
        )

        cache_clear = await clear_artwork_print_storefront_cache()
        report = {
            "status": "ready" if validation.get("approved") else "failed",
            "started_at": started_at.isoformat(),
            "finished_at": datetime.now(UTC).isoformat(),
            "policy_version": ProdigiBusinessPolicyService.POLICY_VERSION,
            "csv_rebuild": rebuild_result,
            "validation": validation,
            "cache_clear": cache_clear,
            "operational_note": (
                "Run this against the production database after code deploy and "
                "migrations. It rebuilds catalog/storefront data from the committed "
                "curated Prodigi CSV; it does not copy local database snapshots."
            ),
        }
        write_report(options.output, report)
        return report


def write_report(output: str | None, report: dict[str, Any]) -> None:
    if not output:
        return
    path = Path(output)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2, ensure_ascii=False, default=str), encoding="utf-8")


def assert_curated_csv_ready(curated_csv_path: str | None) -> None:
    stats = ProdigiCuratedCsvSource(csv_path=curated_csv_path).describe()
    if stats.size_bytes <= 0 or stats.rows_seen <= 0:
        raise RuntimeError(
            "Curated Prodigi CSV source is missing usable rows. "
            "Generate it with python -m src.integrations.prodigi.tasks."
            "prodigi_prepare_storefront_source before running production prepare."
        )
