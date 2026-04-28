"""
Repository for structured print-preparation assets.
"""

from __future__ import annotations

from sqlalchemy import delete, select

from src.models.artwork_print_assets import ArtworkPrintAssetOrm
from src.repositories.base import BaseRepository
from src.repositories.mappers.mappers import ArtworkPrintAssetMapper


class ArtworkPrintAssetsRepository(BaseRepository):
    model = ArtworkPrintAssetOrm
    mapper = ArtworkPrintAssetMapper

    async def list_for_artwork(self, artwork_id: int):
        query = (
            select(self.model)
            .where(self.model.artwork_id == artwork_id)
            .order_by(
                self.model.category_id,
                self.model.asset_role,
                self.model.slot_size_label,
                self.model.id,
            )
        )
        result = await self.session.execute(query)
        return [self.mapper.map_to_schema(model) for model in result.scalars().all()]

    async def list_for_artwork_ids(self, artwork_ids: list[int]):
        if not artwork_ids:
            return []
        query = (
            select(self.model)
            .where(self.model.artwork_id.in_(artwork_ids))
            .order_by(
                self.model.artwork_id,
                self.model.category_id,
                self.model.asset_role,
                self.model.slot_size_label,
                self.model.id,
            )
        )
        result = await self.session.execute(query)
        return [self.mapper.map_to_schema(model) for model in result.scalars().all()]

    async def delete_one(self, asset_id: int) -> None:
        await self.session.execute(delete(self.model).where(self.model.id == asset_id))

    async def get_file_urls_for_artwork(self, artwork_id: int) -> list[str]:
        """Return all non-null file_url values for a given artwork.

        Called *before* the artwork row is deleted so that cascade doesn't
        destroy the metadata we need for file cleanup.
        """
        query = (
            select(self.model.file_url)
            .where(self.model.artwork_id == artwork_id)
            .where(self.model.file_url.isnot(None))
        )
        result = await self.session.execute(query)
        return [row[0] for row in result.all()]

