from __future__ import annotations

import argparse
import asyncio
import json

from src.database import new_session_null_pool
from src.integrations.prodigi.services.prodigi_production_prepare_decider import (
    ProdigiProductionPrepareDecider,
)


async def run(args: argparse.Namespace) -> dict:
    async with new_session_null_pool() as session:
        decision = await ProdigiProductionPrepareDecider(
            session,
            curated_csv_path=args.curated_csv,
        ).evaluate(force=args.force)
    return decision.as_dict()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Decide whether production needs a Prodigi storefront prepare run."
    )
    parser.add_argument("--curated-csv", help="Committed curated Prodigi CSV path.")
    parser.add_argument("--force", action="store_true")
    parser.add_argument(
        "--format",
        choices=("json", "shell"),
        default="json",
        help="Output JSON or shell-friendly PRODIGI_PREPARE_NEEDED lines.",
    )
    args = parser.parse_args()
    decision = asyncio.run(run(args))
    if args.format == "shell":
        print(f"PRODIGI_PREPARE_NEEDED={str(decision['prepare_needed']).lower()}")
        print(f"PRODIGI_PREPARE_STATUS={decision['status']}")
        print(f"PRODIGI_PREPARE_REASONS={','.join(decision['reasons'])}")
        return
    print(json.dumps(decision, indent=2, ensure_ascii=False, default=str))


if __name__ == "__main__":
    main()
