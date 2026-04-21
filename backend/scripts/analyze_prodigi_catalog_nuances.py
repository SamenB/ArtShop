"""
Inspect curated Prodigi option nuances for framed paper and canvas products.

This report is meant for commercial decision-making before we bake storefront
offers. It answers questions like:
- which frame colors have broad country coverage,
- whether acrylic or float glass is more operationally reliable,
- which mount/mat options exist,
- what shipping methods and source countries we actually have.

Example:
    python backend/scripts/analyze_prodigi_catalog_nuances.py
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))


def _print_attribute_block(field_name: str, payload: dict) -> None:
    values = payload["values"]
    if not values:
        return

    print(f"  {field_name}:")
    for item in values[:10]:
        print(
            "    "
            f"{item['value']} | countries={item['country_count']} | rows={item['row_count']} | "
            f"sources={', '.join(item['source_countries']) or '-'}"
        )


def _print_shipping_block(items: list[dict]) -> None:
    print("  shipping:")
    for item in items[:8]:
        print(
            "    "
            f"{item['shipping_method']} | sources={', '.join(item['source_countries']) or '-'} | "
            f"median shipping={item['median_shipping_price']} | "
            f"median product={item['median_product_price']} | "
            f"median days={item['median_min_shipping_days']}-{item['median_max_shipping_days']}"
        )


async def async_main() -> None:
    from src.database import new_session
    from src.repositories.prodigi_catalog import ProdigiCatalogRepository
    from src.services.prodigi_catalog_insights import ProdigiCatalogInsightsService
    from src.services.prodigi_catalog_preview import ProdigiCatalogPreviewService
    from src.utils.db_manager import DBManager

    async with DBManager(session_factory=new_session) as db:
        preview_service = ProdigiCatalogPreviewService(db)
        repository = ProdigiCatalogRepository(db.session)
        insights_service = ProdigiCatalogInsightsService()

        category_defs = preview_service.get_category_defs("hahnemuhle_german_etching")
        rows = await repository.get_curated_rows(category_defs)
        report = insights_service.build_category_report(rows)

        print(f"Curated categories analyzed: {report['category_count']}")
        for category in report["categories"]:
            print()
            print(f"=== {category['category_id']} ===")
            print(
                f"rows={category['row_count']} "
                f"variants={category['variant_count']} "
                f"countries={category['country_count']} "
                f"sources={', '.join(category['source_countries']) or '-'}"
            )

            for field_name in (
                "frame",
                "color",
                "glaze",
                "mount",
                "mount_color",
                "paper_type",
                "wrap",
                "edge",
                "style",
            ):
                _print_attribute_block(field_name, category["attributes"][field_name])

            _print_shipping_block(category["shipping_methods"])


def main() -> None:
    asyncio.run(async_main())


if __name__ == "__main__":
    main()
