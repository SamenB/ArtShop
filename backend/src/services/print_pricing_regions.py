"""Service layer for print pricing regions and category multipliers."""

from __future__ import annotations

from typing import Any

from loguru import logger
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from src.models.print_pricing_regions import (
    PrintPricingRegionMultiplierOrm,
    PrintPricingRegionOrm,
)

DEFAULT_REGIONS: list[dict[str, Any]] = [
    {
        "slug": "premium",
        "label": "Premium",
        "country_codes": [
            "US",
            "CA",
            "GB",
            "IE",
            "AU",
            "NZ",
            "DE",
            "AT",
            "CH",
            "LI",
            "SE",
            "NO",
            "DK",
            "FI",
            "IS",
            "FR",
            "NL",
            "BE",
            "LU",
            "IT",
            "ES",
            "PT",
            "MC",
            "SM",
            "AD",
            "JP",
            "SG",
            "KR",
            "HK",
            "TW",
            "AE",
            "IL",
            "SA",
            "KW",
            "QA",
            "BH",
            "OM",
            "BN",
        ],
        "default_multiplier": 3.0,
        "sort_order": 1,
        "is_fallback": False,
    },
    {
        "slug": "mid",
        "label": "Mid",
        "country_codes": [
            "UA",
            "PL",
            "CZ",
            "HU",
            "RO",
            "SK",
            "SI",
            "HR",
            "EE",
            "LV",
            "LT",
            "BG",
            "GR",
            "CY",
            "MT",
            "BA",
            "ME",
            "MK",
            "AL",
            "RS",
            "XK",
            "TR",
            "MX",
            "PR",
            "ZA",
            "BR",
            "AR",
            "CL",
            "CO",
            "UY",
            "MY",
            "CN",
            "TH",
            "ID",
            "PH",
            "IN",
            "VN",
            "KZ",
            "GE",
            "AM",
            "AZ",
            "MD",
        ],
        "default_multiplier": 2.7,
        "sort_order": 2,
        "is_fallback": False,
    },
    {
        "slug": "budget",
        "label": "Budget / Fallback",
        "country_codes": [],
        "default_multiplier": 2.4,
        "sort_order": 3,
        "is_fallback": True,
    },
]

RECOMMENDED_CATEGORY_MULTIPLIERS: dict[str, dict[str, float]] = {
    "premium": {
        "paperPrintRolled": 3.4,
        "paperPrintBoxFramed": 2.45,
        "paperPrintClassicFramed": 2.5,
        "canvasRolled": 3.25,
        "canvasStretched": 2.85,
        "canvasClassicFrame": 2.3,
        "canvasFloatingFrame": 2.2,
    },
    "mid": {
        "paperPrintRolled": 3.0,
        "paperPrintBoxFramed": 2.15,
        "paperPrintClassicFramed": 2.2,
        "canvasRolled": 2.9,
        "canvasStretched": 2.55,
        "canvasClassicFrame": 2.05,
        "canvasFloatingFrame": 1.95,
    },
    "budget": {
        "paperPrintRolled": 2.65,
        "paperPrintBoxFramed": 1.9,
        "paperPrintClassicFramed": 1.95,
        "canvasRolled": 2.55,
        "canvasStretched": 2.3,
        "canvasClassicFrame": 1.8,
        "canvasFloatingFrame": 1.75,
    },
}

LEGACY_REGION_SLUGS = {
    "premium_west",
    "dach",
    "nordics",
    "western_eu",
    "asia_pacific",
    "eastern_eu",
    "rest_of_world",
}

ALL_CATEGORY_IDS: list[str] = [
    "paperPrintRolled",
    "paperPrintBoxFramed",
    "paperPrintClassicFramed",
    "canvasRolled",
    "canvasStretched",
    "canvasClassicFrame",
    "canvasFloatingFrame",
]


class PrintPricingRegionService:
    """Manages regional pricing multipliers."""

    def __init__(self, db):
        self.db = db

    async def get_all_regions(self) -> list[dict[str, Any]]:
        """Return all regions with their multiplier overrides."""
        if await self._needs_default_sync():
            await self.seed_defaults()
        regions = (
            (
                await self.db.session.execute(
                    select(PrintPricingRegionOrm)
                    .options(selectinload(PrintPricingRegionOrm.multipliers))
                    .order_by(PrintPricingRegionOrm.sort_order)
                )
            )
            .scalars()
            .all()
        )
        return [self._serialize_region(region) for region in regions]

    async def get_region_by_id(self, region_id: int) -> dict[str, Any] | None:
        region = (
            await self.db.session.execute(
                select(PrintPricingRegionOrm)
                .options(selectinload(PrintPricingRegionOrm.multipliers))
                .where(PrintPricingRegionOrm.id == region_id)
            )
        ).scalar_one_or_none()
        if region is None:
            return None
        return self._serialize_region(region)

    async def get_multiplier_for_country(self, country_code: str, category_id: str) -> float:
        """Resolve the multiplier for a country and category."""
        normalized = (country_code or "").upper()
        regions = (
            (
                await self.db.session.execute(
                    select(PrintPricingRegionOrm)
                    .options(selectinload(PrintPricingRegionOrm.multipliers))
                    .order_by(PrintPricingRegionOrm.sort_order)
                )
            )
            .scalars()
            .all()
        )

        matched_region: PrintPricingRegionOrm | None = None
        fallback_region: PrintPricingRegionOrm | None = None
        for region in regions:
            if region.is_fallback:
                fallback_region = region
            if normalized in (region.country_codes or []):
                matched_region = region
                break

        region = matched_region or fallback_region
        if region is None:
            return 3.0

        for multiplier in region.multipliers:
            if multiplier.category_id == category_id:
                return multiplier.multiplier
        return region.default_multiplier

    async def update_region_multipliers(
        self,
        region_id: int,
        *,
        default_multiplier: float | None = None,
        category_multipliers: dict[str, float] | None = None,
    ) -> dict[str, Any] | None:
        """Bulk-update a region default and optional category overrides."""
        region = (
            await self.db.session.execute(
                select(PrintPricingRegionOrm)
                .options(selectinload(PrintPricingRegionOrm.multipliers))
                .where(PrintPricingRegionOrm.id == region_id)
            )
        ).scalar_one_or_none()
        if region is None:
            return None

        if default_multiplier is not None:
            region.default_multiplier = default_multiplier

        if category_multipliers is not None:
            existing_by_category = {item.category_id: item for item in region.multipliers}
            effective_default = region.default_multiplier

            for category_id, value in category_multipliers.items():
                if category_id not in ALL_CATEGORY_IDS:
                    continue
                if abs(value - effective_default) < 0.001:
                    if category_id in existing_by_category:
                        await self.db.session.delete(existing_by_category[category_id])
                    continue
                if category_id in existing_by_category:
                    existing_by_category[category_id].multiplier = value
                    continue
                self.db.session.add(
                    PrintPricingRegionMultiplierOrm(
                        region_id=region.id,
                        category_id=category_id,
                        multiplier=value,
                    )
                )

        await self.db.session.commit()
        await self.db.session.refresh(region)
        logger.info("Updated pricing region {} multipliers", region.slug)
        return self._serialize_region(region)

    async def move_country_to_region(
        self,
        *,
        country_code: str,
        target_region_slug: str,
    ) -> list[dict[str, Any]] | None:
        """Move a country into one pricing region, or into fallback by removing it."""
        normalized_country = (country_code or "").upper().strip()
        target_slug = (target_region_slug or "").lower().strip()
        if len(normalized_country) != 2 and normalized_country != "XK":
            return None

        regions = (
            (
                await self.db.session.execute(
                    select(PrintPricingRegionOrm)
                    .options(selectinload(PrintPricingRegionOrm.multipliers))
                    .order_by(PrintPricingRegionOrm.sort_order)
                )
            )
            .scalars()
            .all()
        )
        regions_by_slug = {region.slug: region for region in regions}
        target_region = regions_by_slug.get(target_slug)
        if target_region is None:
            return None

        for region in regions:
            codes = [code.upper() for code in (region.country_codes or [])]
            region.country_codes = [code for code in codes if code != normalized_country]

        if not target_region.is_fallback:
            target_codes = list(target_region.country_codes or [])
            if normalized_country not in target_codes:
                target_codes.append(normalized_country)
            target_region.country_codes = self._sort_country_codes(target_region.slug, target_codes)

        await self.db.session.commit()
        logger.info("Moved country {} to pricing region {}", normalized_country, target_slug)
        return await self.get_all_regions()

    async def seed_defaults(self) -> dict[str, Any]:
        """
        Upsert the managed three-region pricing model.

        Existing overrides on premium/mid/budget are preserved. Obsolete seven-region
        draft rows are removed.
        """
        existing = (
            (
                await self.db.session.execute(
                    select(PrintPricingRegionOrm).options(
                        selectinload(PrintPricingRegionOrm.multipliers)
                    )
                )
            )
            .scalars()
            .all()
        )
        existing_by_slug = {region.slug: region for region in existing}
        desired_slugs = {region["slug"] for region in DEFAULT_REGIONS}

        created = 0
        updated = 0
        for region_data in DEFAULT_REGIONS:
            region = existing_by_slug.get(region_data["slug"])
            if region is None:
                region = PrintPricingRegionOrm(**region_data)
                self.db.session.add(region)
                await self.db.session.flush()
                self._seed_missing_recommended_overrides(region)
                created += 1
                continue
            region.label = region_data["label"]
            region.sort_order = region_data["sort_order"]
            region.is_fallback = region_data["is_fallback"]
            self._seed_missing_recommended_overrides(region)
            updated += 1

        allowed_categories = set(ALL_CATEGORY_IDS)
        for region in existing:
            for multiplier in region.multipliers:
                if multiplier.category_id not in allowed_categories:
                    await self.db.session.delete(multiplier)

        removed = 0
        for region in existing:
            if region.slug in LEGACY_REGION_SLUGS or (
                region.slug not in desired_slugs and region.sort_order >= 90
            ):
                await self.db.session.delete(region)
                removed += 1

        await self.db.session.commit()
        logger.info("Upserted print pricing regions: {} created, {} updated", created, updated)
        return {
            "seeded": True,
            "count": len(DEFAULT_REGIONS),
            "created": created,
            "updated": updated,
            "removed_legacy": removed,
        }

    async def _needs_default_sync(self) -> bool:
        existing = (
            (
                await self.db.session.execute(
                    select(PrintPricingRegionOrm).options(
                        selectinload(PrintPricingRegionOrm.multipliers)
                    )
                )
            )
            .scalars()
            .all()
        )
        if not existing:
            return True
        existing_slugs = {region.slug for region in existing}
        desired_slugs = {region["slug"] for region in DEFAULT_REGIONS}
        if bool(existing_slugs & LEGACY_REGION_SLUGS) or not desired_slugs.issubset(existing_slugs):
            return True
        for region in existing:
            recommended = RECOMMENDED_CATEGORY_MULTIPLIERS.get(region.slug)
            if not recommended:
                continue
            existing_overrides = {item.category_id for item in region.multipliers}
            if not set(recommended).issubset(existing_overrides):
                return True
        return False

    def _seed_missing_recommended_overrides(self, region: PrintPricingRegionOrm) -> None:
        recommended = RECOMMENDED_CATEGORY_MULTIPLIERS.get(region.slug, {})
        if not recommended:
            return
        existing = {item.category_id for item in region.multipliers}
        for category_id, multiplier in recommended.items():
            if category_id in existing:
                continue
            self.db.session.add(
                PrintPricingRegionMultiplierOrm(
                    region_id=region.id,
                    category_id=category_id,
                    multiplier=multiplier,
                )
            )

    def _sort_country_codes(self, region_slug: str, country_codes: list[str]) -> list[str]:
        unique_codes = sorted({code.upper() for code in country_codes if code})
        if region_slug == "mid" and "UA" in unique_codes:
            unique_codes.remove("UA")
            return ["UA", *unique_codes]
        return unique_codes

    def _serialize_region(self, region: PrintPricingRegionOrm) -> dict[str, Any]:
        overrides = {item.category_id: item.multiplier for item in region.multipliers}
        category_grid = {
            category_id: overrides.get(category_id, region.default_multiplier)
            for category_id in ALL_CATEGORY_IDS
        }
        return {
            "id": region.id,
            "slug": region.slug,
            "label": region.label,
            "country_codes": list(region.country_codes or []),
            "default_multiplier": region.default_multiplier,
            "sort_order": region.sort_order,
            "is_fallback": region.is_fallback,
            "category_multipliers": category_grid,
            "override_count": len(overrides),
        }
