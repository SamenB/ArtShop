from __future__ import annotations

import argparse
import asyncio
import json
from typing import Any

from src.database import new_session_null_pool
from src.integrations.prodigi.services.prodigi_production_prepare import (
    ProdigiProductionPrepareOptions,
    ProdigiProductionPrepareService,
)
from src.utils.db_manager import DBManager


async def run(args: argparse.Namespace) -> dict[str, Any]:
    options = ProdigiProductionPrepareOptions.from_namespace(args)
    async with DBManager(session_factory=new_session_null_pool) as db:
        return await ProdigiProductionPrepareService(db).run(options)


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


if __name__ == "__main__":
    main()
