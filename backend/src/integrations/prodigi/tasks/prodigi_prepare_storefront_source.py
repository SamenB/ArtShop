from __future__ import annotations

import argparse
import json
from dataclasses import asdict

from src.integrations.prodigi.catalog_pipeline.curator import (
    DEFAULT_MAX_CURATED_CSV_BYTES,
    ProdigiCuratedCsvBuilder,
)


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Build the small committed Prodigi storefront CSV from the local, "
            "gitignored raw supplier dump."
        )
    )
    parser.add_argument("--raw-csv-root", help="Raw supplier CSV directory.")
    parser.add_argument("--output", help="Curated CSV output path.")
    parser.add_argument(
        "--max-size-mb",
        type=int,
        default=DEFAULT_MAX_CURATED_CSV_BYTES // (1024 * 1024),
        help="Fail if output is larger than this many MiB.",
    )
    parser.add_argument("--allow-large", action="store_true")
    args = parser.parse_args()
    result = ProdigiCuratedCsvBuilder(
        raw_csv_root=args.raw_csv_root,
        output_path=args.output,
    ).build(
        max_size_bytes=args.max_size_mb * 1024 * 1024,
        allow_large=args.allow_large,
    )
    print(json.dumps(asdict(result), indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
