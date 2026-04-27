from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from src.database import new_session_null_pool
from src.models.artworks import ArtworksOrm
from src.services.prodigi_order_assets import ProdigiOrderAssetService
from src.utils.db_manager import DBManager


async def export_test_resizes(
    *,
    artwork_id: int,
    country_code: str,
    limit: int,
) -> Path:
    async with DBManager(session_factory=new_session_null_pool) as db:
        result = await db.session.execute(
            select(ArtworksOrm)
            .where(ArtworksOrm.id == artwork_id)
            .options(selectinload(ArtworksOrm.print_aspect_ratio))
        )
        artwork = result.scalar_one()
        ratio_label = artwork.print_aspect_ratio.label if artwork.print_aspect_ratio else None
        if not ratio_label:
            raise RuntimeError(f"Artwork {artwork_id} has no print_aspect_ratio")

        service = ProdigiOrderAssetService(db.session)
        active_bake = await service.storefront_repository.get_active_bake()
        if active_bake is None:
            raise RuntimeError("No active Prodigi storefront bake found")

        groups = await service.storefront_repository.get_ratio_country_groups(
            active_bake.id,
            ratio_label,
            country_code.upper(),
        )
        export_root = Path("static") / "print-prep-test" / f"artwork_{artwork_id}_{country_code.upper()}"
        manifest: list[dict[str, Any]] = []
        seen: set[tuple[str, str]] = set()

        for group in groups:
            for size in sorted(group.sizes, key=lambda item: (item.slot_size_label, item.id)):
                if len(manifest) >= limit:
                    break
                if not size.available:
                    continue
                key = (group.category_id, size.slot_size_label)
                if key in seen:
                    continue
                seen.add(key)
                master_asset = await service.resolve_master_asset(
                    artwork_id=artwork_id,
                    category_id=group.category_id,
                )
                if master_asset is None:
                    continue
                target = await service.resolve_target_size(
                    category_id=group.category_id,
                    slot_size_label=size.slot_size_label,
                    sku=size.sku,
                    country_code=country_code,
                )
                if target is None:
                    continue
                rendered = service.render_from_master(
                    master_asset=master_asset,
                    category_id=group.category_id,
                    slot_size_label=size.slot_size_label,
                    target_width=int(target["width_px"]),
                    target_height=int(target["height_px"]),
                    output_dir=export_root / group.category_id,
                    white_border_pct=float(artwork.white_border_pct or 5.0) if group.category_id.startswith("paperPrint") else 0.0,
                )
                manifest.append(
                    {
                        "category_id": group.category_id,
                        "slot_size_label": size.slot_size_label,
                        "sku": size.sku,
                        "target_width_px": rendered["width_px"],
                        "target_height_px": rendered["height_px"],
                        "file_path": rendered["file_path"],
                        "derivative_kind": rendered["derivative_kind"],
                        "source_master_asset_id": rendered["source_master_asset_id"],
                    }
                )
            if len(manifest) >= limit:
                break

        export_root.mkdir(parents=True, exist_ok=True)
        manifest_path = export_root / "manifest.json"
        manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        return export_root


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--artwork-id", type=int, required=True)
    parser.add_argument("--country", default="DE")
    parser.add_argument("--limit", type=int, default=50)
    args = parser.parse_args()

    output_dir = asyncio.run(
        export_test_resizes(
            artwork_id=args.artwork_id,
            country_code=args.country,
            limit=args.limit,
        )
    )
    print(output_dir)


if __name__ == "__main__":
    main()
