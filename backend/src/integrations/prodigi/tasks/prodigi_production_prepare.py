from __future__ import annotations

import argparse
import asyncio
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from src.database import new_session_null_pool
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
from src.utils.db_manager import DBManager


async def run(args: argparse.Namespace) -> dict[str, Any]:
    started_at = datetime.now(UTC)
    async with DBManager(session_factory=new_session_null_pool) as db:
        rebuild_result = None
        if not args.skip_csv_rebuild:
            rebuild_result = await ProdigiCsvStorefrontRebuildService(
                db,
                curated_csv_path=args.curated_csv,
            ).rebuild(
                selected_ratio=args.selected_ratio,
                selected_country=args.selected_country,
                selected_paper_material=args.selected_paper_material,
                include_notice_level=not args.strict_fulfillment_only,
            )

        validation = await ProdigiFulfillmentValidationService(db.session).run(
            ValidationConfig(
                countries=args.country or KEY_COUNTRIES,
                ratios=args.ratio or None,
                categories=args.category or None,
                max_sizes_per_group=args.max_sizes_per_group,
                simulate_orders=args.simulate_orders,
                batch_size=args.batch_size,
                include_api_checks=args.include_api_checks,
                include_quotes=args.include_quotes,
                thresholds=ValidationThresholds(
                    min_samples=args.min_samples,
                    min_simulated_orders=args.min_simulated_orders,
                    max_failures=args.max_failures,
                    min_pass_rate=args.min_pass_rate,
                    require_api_checks=args.require_api_checks,
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
            "Run this on the production server against the production database after "
            "code deploy and migrations. It rebuilds catalog/storefront data from "
            "the committed curated Prodigi CSV; it does not copy local database snapshots."
        ),
    }
    _write_report(args.output, report)
    return report


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Prepare production Prodigi storefront/fulfillment data: rebuild active "
            "CSV-backed storefront data, materialize artwork payloads, clear runtime "
            "caches, and emit a validation report."
        )
    )
    parser.add_argument("--skip-csv-rebuild", action="store_true")
    parser.add_argument(
        "--curated-csv",
        help="Committed curated Prodigi CSV path. Defaults to PRODIGI_CURATED_CSV_PATH.",
    )
    parser.add_argument(
        "--csv-root",
        dest="curated_csv",
        help=argparse.SUPPRESS,
    )
    parser.add_argument("--selected-ratio")
    parser.add_argument("--selected-country")
    parser.add_argument("--selected-paper-material")
    parser.add_argument("--strict-fulfillment-only", action="store_true")
    parser.add_argument("--country", action="append", help="Country code. Repeatable.")
    parser.add_argument("--ratio", action="append", help="Ratio label, e.g. 4:5. Repeatable.")
    parser.add_argument("--category", action="append", help="Prodigi category id. Repeatable.")
    parser.add_argument("--max-sizes-per-group", type=int, default=0)
    parser.add_argument("--simulate-orders", type=int, default=1500)
    parser.add_argument("--batch-size", type=int, default=3)
    parser.add_argument("--include-api-checks", action="store_true")
    parser.add_argument("--include-quotes", action="store_true")
    parser.add_argument("--require-api-checks", action="store_true")
    parser.add_argument("--min-samples", type=int, default=1)
    parser.add_argument("--min-simulated-orders", type=int, default=1)
    parser.add_argument("--max-failures", type=int, default=0)
    parser.add_argument("--min-pass-rate", type=float, default=1.0)
    parser.add_argument(
        "--output",
        default="temp/prodigi_production_prepare_report.json",
        help="Where to write the JSON report.",
    )
    args = parser.parse_args()
    report = asyncio.run(run(args))
    print(json.dumps(report, indent=2, ensure_ascii=False, default=str))


def _write_report(output: str | None, report: dict[str, Any]) -> None:
    if not output:
        return
    path = Path(output)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2, ensure_ascii=False, default=str), encoding="utf-8")


if __name__ == "__main__":
    main()
