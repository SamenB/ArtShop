"""
Service layer for artwork business logic.
Handles sophisticated operations like unique slug generation, relationship management,
and bulk processing, abstracting data access from the API layer.
"""

import re

from loguru import logger
from sqlalchemy.exc import SQLAlchemyError

from src.exeptions import (
    DatabaseException,
    ObjectAlreadyExistsException,
)
from src.print_on_demand import get_print_provider
from src.schemas.artworks import (
    ArtworkAdd,
    ArtworkAddBulk,
    ArtworkAddRequest,
    ArtworkPatch,
    ArtworkPatchRequest,
)
from src.schemas.labels import ArtworkLabelAdd
from src.services.artwork_print_workflow import ArtworkPrintWorkflowService
from src.services.base import BaseService


class ArtworkService(BaseService):
    """
    Provides high-level methods for managing artworks.
    Ensures data consistency and handles transaction management.
    """

    @staticmethod
    def _serialize_public_artwork(artwork):
        return artwork.model_dump(
            mode="json",
            exclude={
                "print_aspect_ratio": True,
                "print_source_metadata": True,
                "print_profile_overrides": True,
                "print_quality_url": True,
            },
        )

    @staticmethod
    def _serialize_admin_artwork(artwork):
        return artwork.model_dump(mode="json")

    async def _attach_storefront_summaries(
        self,
        *,
        artworks: list,
        country_code: str,
        serializer,
    ) -> list[dict]:
        summaries = await get_print_provider().build_shop_summaries(
            db=self.db,
            artworks=artworks,
            country_code=country_code,
        )
        enriched_artworks = []
        for artwork in artworks:
            item = serializer(artwork)
            storefront_summary = summaries.get(artwork.id)
            item["storefront_summary"] = storefront_summary
            item["has_prints"] = bool(
                storefront_summary and storefront_summary.get("print_country_supported")
            )
            item["base_print_price"] = (
                storefront_summary.get("min_print_price") if storefront_summary else None
            )
            enriched_artworks.append(item)
        return enriched_artworks

    async def _attach_print_readiness(self, artworks: list) -> list[dict]:
        summaries = await ArtworkPrintWorkflowService(self.db).build_bulk_readiness_summaries(artworks)
        enriched_artworks = []
        for artwork in artworks:
            item = self._serialize_admin_artwork(artwork)
            item["print_readiness_summary"] = summaries.get(artwork.id)
            enriched_artworks.append(item)
        return enriched_artworks

    async def get_artwork_by_id(self, artwork_id: int):
        """
        Retrieves a single artwork by its numeric primary key.
        """
        artwork = await self.db.artworks.get_one(id=artwork_id)
        return artwork

    async def get_artwork_by_slug(self, slug: str):
        """
        Retrieves a single artwork by its unique URL-friendly slug.
        """
        artwork = await self.db.artworks.get_one(slug=slug)
        return artwork

    async def generate_unique_slug(self, title: str) -> str:
        """
        Generates a unique, URL-safe slug from an artwork title.
        Appends a numeric suffix if a collision is detected in the database.
        """
        base_slug = title.lower()
        base_slug = re.sub(r"[^a-z0-9]+", "-", base_slug).strip("-")
        if not base_slug:
            base_slug = "artwork"

        slug = base_slug
        counter = 1
        while True:
            existing = await self.db.artworks.get_one_or_none(slug=slug)
            if not existing:
                break
            slug = f"{base_slug}-{counter}"
            counter += 1
        return slug

    async def get_all_artworks(
        self,
        limit: int = 10,
        offset: int = 0,
        title: str | None = None,
        labels: list[int] | None = None,
        year_from: int | None = None,
        year_to: int | None = None,
        price_min: int | None = None,
        price_max: int | None = None,
        orientation: str | None = None,
        size_category: str | None = None,
        country_code: str | None = None,
    ):
        """
        Retrieves a list of artworks based on filtered availability and metadata.
        Standardizes error handling for database-level exceptions.
        """
        try:
            artworks = await self.db.artworks.get_available_artworks(
                limit=limit,
                offset=offset,
                title=title,
                labels=labels,
                year_from=year_from,
                year_to=year_to,
                price_min=price_min,
                price_max=price_max,
                orientation=orientation,
                size_category=size_category,
            )
        except SQLAlchemyError:
            raise DatabaseException

        if country_code:
            artworks = await self._attach_storefront_summaries(
                artworks=artworks,
                country_code=country_code,
                serializer=self._serialize_public_artwork,
            )

        logger.info(f"Artworks retrieved: count={len(artworks)}, title={title}, labels={labels}")
        return artworks

    async def get_admin_artworks(
        self,
        limit: int = 10,
        offset: int = 0,
        title: str | None = None,
        labels: list[int] | None = None,
        year_from: int | None = None,
        year_to: int | None = None,
        price_min: int | None = None,
        price_max: int | None = None,
        orientation: str | None = None,
        size_category: str | None = None,
        include_print_readiness: bool = False,
        country_code: str | None = None,
    ):
        try:
            artworks = await self.db.artworks.get_admin_artworks(
                limit=limit,
                offset=offset,
                title=title,
                labels=labels,
                year_from=year_from,
                year_to=year_to,
                price_min=price_min,
                price_max=price_max,
                orientation=orientation,
                size_category=size_category,
            )
        except SQLAlchemyError:
            raise DatabaseException

        if include_print_readiness:
            artworks = await self._attach_print_readiness(artworks)

        if country_code:
            base_artworks = artworks if artworks and not isinstance(artworks[0], dict) else []
            if base_artworks:
                artworks = await self._attach_storefront_summaries(
                    artworks=base_artworks,
                    country_code=country_code,
                    serializer=self._serialize_admin_artwork,
                )
            else:
                raw_artworks = await self.db.artworks.get_admin_artworks(
                    limit=limit,
                    offset=offset,
                    title=title,
                    labels=labels,
                    year_from=year_from,
                    year_to=year_to,
                    price_min=price_min,
                    price_max=price_max,
                    orientation=orientation,
                    size_category=size_category,
                )
                storefront_items = await self._attach_storefront_summaries(
                    artworks=raw_artworks,
                    country_code=country_code,
                    serializer=self._serialize_admin_artwork,
                )
                if include_print_readiness:
                    readiness_by_id = {
                        item["id"]: item.get("print_readiness_summary") for item in artworks
                    }
                    for item in storefront_items:
                        item["print_readiness_summary"] = readiness_by_id.get(item["id"])
                artworks = storefront_items

        logger.info("Admin artworks retrieved: count={}, readiness={}", len(artworks), include_print_readiness)
        return artworks

    async def _refresh_materialized_storefront(self, artwork_ids: list[int]) -> None:
        if not artwork_ids:
            return
        try:
            await get_print_provider().rematerialize_artworks(
                db=self.db,
                artwork_ids=artwork_ids,
            )
        except Exception as exc:
            logger.warning(
                "Skipping storefront rematerialization for artworks {}: {}",
                artwork_ids,
                exc,
            )

    async def create_artwork(self, artwork_data: ArtworkAddRequest):
        """
        Stores a new artwork record and its associated labels.
        Handles default collection assignment ('Sketch') and unique slug generation.
        """
        try:
            artwork_dict = artwork_data.model_dump()
            artwork_dict["slug"] = await self.generate_unique_slug(artwork_data.title)

            artwork = await self.db.artworks.add(ArtworkAdd(**artwork_dict))

            # Map label associations
            artwork_labels = [
                ArtworkLabelAdd(artwork_id=artwork.id, label_id=label_id)
                for label_id in artwork_data.labels
            ]
            if artwork_labels:
                await self.db.artwork_labels.add_bulk(artwork_labels)

            await self.db.commit()
        except ObjectAlreadyExistsException:
            raise
        except SQLAlchemyError:
            await self.db.rollback()
            raise DatabaseException
        await self._refresh_materialized_storefront([artwork.id])
        logger.info("Artwork created: id={}", artwork.id)
        return artwork

    async def update_artwork(self, artwork_id: int, artwork_data: ArtworkAddRequest):
        """
        Performs a full update of an artwork record.
        Maintains immutable fields like images (via separate API) and slugs.
        Synchronizes label associations.
        """
        # Verify artwork exists
        existing = await self.db.artworks.get_one(id=artwork_id)

        try:
            # Exclude fields managed by specialized endpoints or immutable logic
            artwork_dict = artwork_data.model_dump()
            artwork_dict.pop("images", None)
            artwork_dict.pop("labels", None)
            artwork_dict.pop("slug", None)

            # Reattach preserved fields
            artwork_dict["slug"] = existing.slug
            artwork_dict["images"] = existing.images

            await self.db.artworks.edit(ArtworkAdd(**artwork_dict), id=artwork_id)
            await self.db.artwork_labels.set_artwork_labels(artwork_id, artwork_data.labels)
            await self.db.commit()
        except SQLAlchemyError:
            await self.db.rollback()
            raise DatabaseException
        await self._refresh_materialized_storefront([artwork_id])
        logger.info("Artwork updated: id={}", artwork_id)

    async def update_artwork_partially(self, artwork_id: int, artwork_data: ArtworkPatchRequest):
        """
        Updates only the specified fields of an artwork record.
        Handles partial metadata and label updates.
        """
        artwork_data_dict = artwork_data.model_dump(exclude_unset=True)
        # Verify artwork existence
        await self.db.artworks.get_one(id=artwork_id)

        try:
            _artwork_data = ArtworkPatch(**artwork_data_dict)
            await self.db.artworks.edit(_artwork_data, exclude_unset=True, id=artwork_id)
            if "labels" in artwork_data_dict:
                await self.db.artwork_labels.set_artwork_labels(artwork_id, artwork_data.labels)
            await self.db.commit()
        except SQLAlchemyError:
            await self.db.rollback()
            raise DatabaseException
        await self._refresh_materialized_storefront([artwork_id])
        logger.info("Artwork partially updated: id={}", artwork_id)

    async def delete_artwork(self, artwork_id: int):
        """
        Removes an artwork record and its associated metadata from the database.
        """
        # Verify existence
        await self.db.artworks.get_one(id=artwork_id)

        try:
            await self.db.artworks.delete(id=artwork_id)
            await self.db.commit()
        except SQLAlchemyError:
            await self.db.rollback()
            raise DatabaseException
        logger.info("Artwork deleted: id={}", artwork_id)

    async def create_artworks_bulk(self, artworks_data: list[ArtworkAddBulk]):
        """
        Efficiently inserts multiple artwork records in a single batch.
        Useful for migrations or bulk administrative actions.
        """
        try:
            artworks_to_add = [ArtworkAdd(**artwork.model_dump()) for artwork in artworks_data]
            await self.db.artworks.add_bulk(artworks_to_add)
            await self.db.commit()
        except ObjectAlreadyExistsException:
            raise
        except SQLAlchemyError:
            await self.db.rollback()
            raise DatabaseException
        logger.info("Bulk artworks created: count={}", len(artworks_to_add))
        return len(artworks_to_add)
