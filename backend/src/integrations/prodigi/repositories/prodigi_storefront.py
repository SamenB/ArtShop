"""
Read repository for materialized Prodigi storefront bake tables.

This repository is intentionally separate from the bake writer service and
focuses on querying the currently active storefront snapshot in a
visualization-friendly shape.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.orm import noload, selectinload

from src.models.artworks import ArtworksOrm
from src.models.prodigi_storefront import (
    ProdigiArtworkStorefrontPayloadOrm,
    ProdigiStorefrontBakeOrm,
    ProdigiStorefrontOfferGroupOrm,
)


class ProdigiStorefrontRepository:
    def __init__(self, session):
        self.session = session

    async def get_active_bake(self) -> ProdigiStorefrontBakeOrm | None:
        query = (
            select(ProdigiStorefrontBakeOrm)
            .options(noload(ProdigiStorefrontBakeOrm.offer_groups))
            .where(ProdigiStorefrontBakeOrm.is_active.is_(True))
            .order_by(
                ProdigiStorefrontBakeOrm.created_at.desc(), ProdigiStorefrontBakeOrm.id.desc()
            )
            .limit(1)
        )
        result = await self.session.execute(query)
        return result.scalar_one_or_none()

    async def get_bake_ratios(self, bake_id: int) -> list[dict[str, Any]]:
        query = (
            select(
                ProdigiStorefrontOfferGroupOrm.ratio_label,
                ProdigiStorefrontOfferGroupOrm.ratio_title,
                func.count().label("group_count"),
                func.count(func.distinct(ProdigiStorefrontOfferGroupOrm.destination_country)).label(
                    "country_count"
                ),
            )
            .where(ProdigiStorefrontOfferGroupOrm.bake_id == bake_id)
            .group_by(
                ProdigiStorefrontOfferGroupOrm.ratio_label,
                ProdigiStorefrontOfferGroupOrm.ratio_title,
            )
            .order_by(
                ProdigiStorefrontOfferGroupOrm.ratio_label,
                ProdigiStorefrontOfferGroupOrm.ratio_title,
            )
        )
        result = await self.session.execute(query)
        return [dict(row) for row in result.mappings()]

    async def get_ratio_groups(
        self,
        bake_id: int,
        ratio_label: str,
    ) -> list[ProdigiStorefrontOfferGroupOrm]:
        query = (
            select(ProdigiStorefrontOfferGroupOrm)
            .where(
                ProdigiStorefrontOfferGroupOrm.bake_id == bake_id,
                ProdigiStorefrontOfferGroupOrm.ratio_label == ratio_label,
            )
            .options(selectinload(ProdigiStorefrontOfferGroupOrm.sizes))
            .order_by(
                ProdigiStorefrontOfferGroupOrm.destination_country_name,
                ProdigiStorefrontOfferGroupOrm.destination_country,
                ProdigiStorefrontOfferGroupOrm.category_label,
            )
        )
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def get_ratio_country_codes(
        self,
        bake_id: int,
        ratio_label: str,
    ) -> list[str]:
        query = (
            select(func.distinct(ProdigiStorefrontOfferGroupOrm.destination_country))
            .where(
                ProdigiStorefrontOfferGroupOrm.bake_id == bake_id,
                ProdigiStorefrontOfferGroupOrm.ratio_label == ratio_label,
            )
            .order_by(ProdigiStorefrontOfferGroupOrm.destination_country)
        )
        result = await self.session.execute(query)
        return [row[0] for row in result.all()]

    async def get_ratio_country_groups(
        self,
        bake_id: int,
        ratio_label: str,
        destination_country: str,
    ) -> list[ProdigiStorefrontOfferGroupOrm]:
        query = (
            select(ProdigiStorefrontOfferGroupOrm)
            .where(
                ProdigiStorefrontOfferGroupOrm.bake_id == bake_id,
                ProdigiStorefrontOfferGroupOrm.ratio_label == ratio_label,
                ProdigiStorefrontOfferGroupOrm.destination_country == destination_country,
            )
            .options(selectinload(ProdigiStorefrontOfferGroupOrm.sizes))
            .order_by(
                ProdigiStorefrontOfferGroupOrm.category_label,
                ProdigiStorefrontOfferGroupOrm.category_id,
            )
        )
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def get_country_groups_for_ratios(
        self,
        bake_id: int,
        destination_country: str,
        ratio_labels: list[str],
    ) -> list[ProdigiStorefrontOfferGroupOrm]:
        if not ratio_labels:
            return []

        query = (
            select(ProdigiStorefrontOfferGroupOrm)
            .where(
                ProdigiStorefrontOfferGroupOrm.bake_id == bake_id,
                ProdigiStorefrontOfferGroupOrm.destination_country == destination_country,
                ProdigiStorefrontOfferGroupOrm.ratio_label.in_(ratio_labels),
            )
            .options(selectinload(ProdigiStorefrontOfferGroupOrm.sizes))
            .order_by(
                ProdigiStorefrontOfferGroupOrm.ratio_label,
                ProdigiStorefrontOfferGroupOrm.category_label,
                ProdigiStorefrontOfferGroupOrm.category_id,
            )
        )
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def get_groups_for_bake_ratios(
        self,
        bake_id: int,
        ratio_labels: list[str],
    ) -> list[ProdigiStorefrontOfferGroupOrm]:
        if not ratio_labels:
            return []

        query = (
            select(ProdigiStorefrontOfferGroupOrm)
            .where(
                ProdigiStorefrontOfferGroupOrm.bake_id == bake_id,
                ProdigiStorefrontOfferGroupOrm.ratio_label.in_(ratio_labels),
            )
            .options(selectinload(ProdigiStorefrontOfferGroupOrm.sizes))
            .order_by(
                ProdigiStorefrontOfferGroupOrm.ratio_label,
                ProdigiStorefrontOfferGroupOrm.destination_country,
                ProdigiStorefrontOfferGroupOrm.category_label,
                ProdigiStorefrontOfferGroupOrm.category_id,
            )
        )
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def get_materialized_payload_for_ref(
        self,
        *,
        bake_id: int,
        artwork_id_or_slug: str,
        country_code: str,
    ) -> ProdigiArtworkStorefrontPayloadOrm | None:
        normalized_country = (country_code or "").upper()
        query = select(ProdigiArtworkStorefrontPayloadOrm).where(
            ProdigiArtworkStorefrontPayloadOrm.bake_id == bake_id,
            ProdigiArtworkStorefrontPayloadOrm.country_code == normalized_country,
        )
        if artwork_id_or_slug.isdigit():
            query = query.where(
                ProdigiArtworkStorefrontPayloadOrm.artwork_id == int(artwork_id_or_slug)
            )
        else:
            query = query.join(
                ArtworksOrm,
                ArtworksOrm.id == ProdigiArtworkStorefrontPayloadOrm.artwork_id,
            ).where(ArtworksOrm.slug == artwork_id_or_slug)
        result = await self.session.execute(query.limit(1))
        return result.scalar_one_or_none()

    async def get_materialized_summaries(
        self,
        *,
        bake_id: int,
        artwork_ids: list[int],
        country_code: str,
    ) -> list[ProdigiArtworkStorefrontPayloadOrm]:
        if not artwork_ids:
            return []
        query = select(ProdigiArtworkStorefrontPayloadOrm).where(
            ProdigiArtworkStorefrontPayloadOrm.bake_id == bake_id,
            ProdigiArtworkStorefrontPayloadOrm.country_code == (country_code or "").upper(),
            ProdigiArtworkStorefrontPayloadOrm.artwork_id.in_(artwork_ids),
        )
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def delete_materialized_payloads(
        self,
        *,
        bake_id: int,
        artwork_ids: list[int] | None = None,
    ) -> None:
        stmt = delete(ProdigiArtworkStorefrontPayloadOrm).where(
            ProdigiArtworkStorefrontPayloadOrm.bake_id == bake_id
        )
        if artwork_ids:
            stmt = stmt.where(ProdigiArtworkStorefrontPayloadOrm.artwork_id.in_(artwork_ids))
        await self.session.execute(stmt)
