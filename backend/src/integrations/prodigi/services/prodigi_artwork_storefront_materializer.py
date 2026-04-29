from __future__ import annotations

from collections import defaultdict
from types import SimpleNamespace
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from src.integrations.prodigi.repositories.prodigi_storefront import ProdigiStorefrontRepository
from src.integrations.prodigi.services.prodigi_artwork_storefront import (
    ProdigiArtworkStorefrontService,
)
from src.integrations.prodigi.services.prodigi_catalog_preview import ProdigiCatalogPreviewService
from src.integrations.prodigi.services.prodigi_storefront_settings import (
    ProdigiStorefrontSettingsService,
)
from src.integrations.prodigi.services.prodigi_storefront_snapshot import (
    ProdigiStorefrontSnapshotService,
)
from src.models.artworks import ArtworksOrm
from src.models.prodigi_storefront import ProdigiArtworkStorefrontPayloadOrm
from src.repositories.utils import available_artwork_ids
from src.services.artwork_print_profiles import ArtworkPrintProfileService


class ProdigiArtworkStorefrontMaterializerService:
    """
    Persists per-artwork, per-country storefront payloads for the active bake.

    Runtime endpoints can then read one prepared JSON blob instead of rebuilding
    business rules, shipping summaries, and print profiles on every request.
    """

    def __init__(self, db):
        self.db = db
        self.repository = ProdigiStorefrontRepository(db.session)
        self.snapshot_service = ProdigiStorefrontSnapshotService(db)
        self.print_profile_service = ArtworkPrintProfileService(db)
        self.artwork_storefront_service = ProdigiArtworkStorefrontService(db)
        self.storefront_settings = ProdigiStorefrontSettingsService(db)

    async def materialize_active_bake(
        self,
        *,
        artwork_ids: list[int] | None = None,
        commit: bool = True,
    ) -> dict[str, Any]:
        active_bake = await self.repository.get_active_bake()
        if active_bake is None:
            return {
                "status": "skipped",
                "reason": "No active bake",
                "artwork_count": 0,
                "payload_count": 0,
            }

        config = await self.storefront_settings.get_effective_config()
        self.snapshot_service.apply_storefront_config(config)
        self.artwork_storefront_service.apply_storefront_config(config)

        artworks = await self._get_candidate_artworks(artwork_ids=artwork_ids)
        if artwork_ids:
            await self.repository.delete_materialized_payloads(
                bake_id=active_bake.id,
                artwork_ids=artwork_ids,
            )
        if not artworks:
            if commit and artwork_ids:
                await self.db.commit()
            return {
                "status": "skipped",
                "reason": "No matching artworks",
                "artwork_count": 0,
                "payload_count": 0,
            }

        ratio_labels = sorted(
            {
                artwork.print_aspect_ratio.label
                for artwork in artworks
                if artwork.print_aspect_ratio and artwork.print_aspect_ratio.label
            }
        )
        snapshot_map = await self._build_snapshot_map(
            bake=active_bake,
            ratio_labels=ratio_labels,
        )
        supported_ratio_labels = set(snapshot_map.keys())

        if not artwork_ids:
            await self.repository.delete_materialized_payloads(
                bake_id=active_bake.id,
            )

        payload_rows: list[ProdigiArtworkStorefrontPayloadOrm] = []
        for artwork in artworks:
            ratio_label = artwork.print_aspect_ratio.label if artwork.print_aspect_ratio else None
            country_snapshots = snapshot_map.get(ratio_label or "", {})
            if not country_snapshots:
                continue

            profile_bundle = self.print_profile_service.build_profile_bundle_for_artwork(
                artwork=artwork,
                bake=active_bake,
                ratio_supported=bool(ratio_label and ratio_label in supported_ratio_labels),
            )
            medium_availability = self.artwork_storefront_service._build_medium_availability(artwork)

            for country_code, snapshot in country_snapshots.items():
                payload = self.artwork_storefront_service.build_payload_from_snapshot(
                    artwork=artwork,
                    requested_country=country_code,
                    profile_bundle=profile_bundle,
                    snapshot=snapshot,
                    medium_availability=medium_availability,
                )
                summary = self.artwork_storefront_service.build_collection_summary(payload)
                payload_rows.append(
                    ProdigiArtworkStorefrontPayloadOrm(
                        bake_id=active_bake.id,
                        artwork_id=artwork.id,
                        country_code=country_code,
                        country_name=payload.get("country_name"),
                        print_country_supported=bool(payload.get("country_supported")),
                        default_medium=summary.get("default_medium"),
                        min_print_price=summary.get("min_print_price"),
                        summary=summary,
                        payload=payload,
                    )
                )

        if payload_rows:
            self.db.session.add_all(payload_rows)
        if commit:
            await self.db.commit()

        return {
            "status": "materialized",
            "bake_id": active_bake.id,
            "artwork_count": len(artworks),
            "payload_count": len(payload_rows),
            "country_count": len(
                {
                    row.country_code
                    for row in payload_rows
                }
            ),
        }

    async def _get_candidate_artworks(
        self,
        *,
        artwork_ids: list[int] | None,
    ) -> list[ArtworksOrm]:
        query = (
            select(ArtworksOrm)
            .options(selectinload(ArtworksOrm.print_aspect_ratio))
            .where(ArtworksOrm.id.in_(available_artwork_ids()))
        )
        if artwork_ids:
            query = query.where(ArtworksOrm.id.in_(artwork_ids))
        result = await self.db.session.execute(query)
        return list(result.scalars().all())

    async def _build_snapshot_map(
        self,
        *,
        bake: Any,
        ratio_labels: list[str],
    ) -> dict[str, dict[str, dict[str, Any]]]:
        if not ratio_labels:
            return {}

        groups = await self.repository.get_groups_for_bake_ratios(bake.id, ratio_labels)
        if not groups:
            return {}

        category_defs = ProdigiCatalogPreviewService(
            SimpleNamespace(session=None)
        ).get_category_defs(bake.paper_material)
        category_sort = {item["id"]: item["sort_order"] for item in category_defs}

        groups_by_ratio_country: dict[str, dict[str, list[Any]]] = defaultdict(
            lambda: defaultdict(list)
        )
        available_countries_by_ratio: dict[str, set[str]] = defaultdict(set)
        for group in groups:
            groups_by_ratio_country[group.ratio_label][group.destination_country].append(group)
            available_countries_by_ratio[group.ratio_label].add(group.destination_country)

        snapshot_map: dict[str, dict[str, dict[str, Any]]] = {}
        for ratio_label, country_groups in groups_by_ratio_country.items():
            snapshot_map[ratio_label] = {}
            available_country_codes = sorted(available_countries_by_ratio[ratio_label])
            for country_code, groups_for_country in country_groups.items():
                sorted_groups = sorted(
                    groups_for_country,
                    key=lambda group: (
                        category_sort.get(group.category_id, 999),
                        group.category_label,
                        group.category_id,
                    ),
                )

                categories = []
                category_cells = []
                for group in sorted_groups:
                    category = {
                        "category_id": group.category_id,
                        "label": group.category_label,
                        "material_label": group.material_label,
                        "frame_label": group.frame_label,
                        "baseline_size_labels": sorted(
                            {size.slot_size_label for size in group.sizes},
                            key=self.snapshot_service._size_sort_key,
                        ),
                        "fixed_attributes": group.fixed_attributes or {},
                        "recommended_defaults": group.recommended_defaults or {},
                        "allowed_attributes": group.allowed_attributes or {},
                        "sort_order": category_sort.get(group.category_id, 999),
                    }
                    categories.append(category)
                    category_cells.append(
                        self.snapshot_service._build_group_cell(
                            category=category,
                            destination_country=country_code,
                            group=group,
                            size_lookup={size.slot_size_label: size for size in group.sizes},
                        )
                    )

                snapshot_map[ratio_label][country_code] = {
                    "has_active_bake": True,
                    "message": "Country storefront slice loaded from the active baked snapshot.",
                    "bake": self.snapshot_service._serialize_bake(bake),
                    "selected_ratio": ratio_label,
                    "country_code": country_code,
                    "country_name": sorted_groups[0].destination_country_name or country_code,
                    "available_country_codes": available_country_codes,
                    "categories": categories,
                    "category_cells": category_cells,
                    "entry_promo": self.snapshot_service._build_country_entry_promo(category_cells),
                }

        return snapshot_map
