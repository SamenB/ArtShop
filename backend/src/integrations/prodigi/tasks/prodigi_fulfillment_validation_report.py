from __future__ import annotations

import argparse
import asyncio
import json

from src.database import new_session_null_pool
from src.integrations.prodigi.services.prodigi_fulfillment_validation import (
    KEY_COUNTRIES,
    ProdigiFulfillmentValidationService,
    ValidationConfig,
    ValidationThresholds,
)


async def run_report(args: argparse.Namespace) -> dict:
    async with new_session_null_pool() as session:
        service = ProdigiFulfillmentValidationService(session)
        return await service.run(
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
                output_path=args.output,
            )
        )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate a measurable dry-run Prodigi fulfillment validation report."
    )
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
        default="temp/prodigi_fulfillment_validation_report.json",
        help="Where to write the JSON report.",
    )
    args = parser.parse_args()
    report = asyncio.run(run_report(args))
    print(json.dumps(report, indent=2, ensure_ascii=False, default=str))


if __name__ == "__main__":
    main()
