"""
CLI for importing local Prodigi CSV files into the ArtShop database.

Examples:
    python scripts/import_prodigi_catalog.py --dry-run
    python scripts/import_prodigi_catalog.py --no-reset
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.services.prodigi_csv_import import ProdigiCsvImportService


async def _main() -> None:
    parser = argparse.ArgumentParser(description="Import Prodigi CSV catalog into PostgreSQL")
    parser.add_argument("--dry-run", action="store_true", help="Parse files without writing to DB")
    parser.add_argument(
        "--no-reset",
        action="store_true",
        help="Do not clear existing imported catalog tables before import",
    )
    parser.add_argument("--max-files", type=int, default=None, help="Limit files for smoke tests")
    parser.add_argument("--max-rows", type=int, default=None, help="Limit rows for smoke tests")
    parser.add_argument(
        "--commit-every",
        type=int,
        default=5000,
        help="Commit every N rows during non-dry import",
    )
    parser.add_argument(
        "--log-every",
        type=int,
        default=5000,
        help="Log progress every N rows",
    )
    args = parser.parse_args()

    service = ProdigiCsvImportService()
    stats = await service.import_catalog(
        reset=not args.no_reset,
        dry_run=args.dry_run,
        max_files=args.max_files,
        max_rows=args.max_rows,
        commit_every=args.commit_every,
        log_every=args.log_every,
    )

    print("Prodigi import summary")
    print(f"  files:    {stats.files_seen}")
    print(f"  rows:     {stats.rows_seen}")
    print(f"  products: {stats.products_created}")
    print(f"  variants: {stats.variants_created}")
    print(f"  routes:   {stats.routes_created}")


if __name__ == "__main__":
    asyncio.run(_main())
