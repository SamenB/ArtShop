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
from src.schemas.artworks import (
    ArtworkAdd,
    ArtworkAddBulk,
    ArtworkAddRequest,
    ArtworkPatch,
    ArtworkPatchRequest,
)
from src.schemas.tags import ArtworkTagAdd
from src.services.base import BaseService


class ArtworkService(BaseService):
    """
    Provides high-level methods for managing artworks.
    Ensures data consistency and handles transaction management.
    """

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
        tags: list[int] | None = None,
        collection_id: int | None = None,
        year_from: int | None = None,
        year_to: int | None = None,
        price_min: int | None = None,
        price_max: int | None = None,
        orientation: str | None = None,
        size_category: str | None = None,
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
                tags=tags,
                collection_id=collection_id,
                year_from=year_from,
                year_to=year_to,
                price_min=price_min,
                price_max=price_max,
                orientation=orientation,
                size_category=size_category,
            )
        except SQLAlchemyError:
            raise DatabaseException
        logger.info(f"Artworks retrieved: count={len(artworks)}, title={title}, tags={tags}")
        return artworks

    async def create_artwork(self, artwork_data: ArtworkAddRequest):
        """
        Stores a new artwork record and its associated tags.
        Handles default collection assignment ('Sketch') and unique slug generation.
        """
        try:
            # Handle collection assignment
            collection_id = artwork_data.collection_id
            if collection_id is None:
                sketch_coll = await self.db.collections.get_one_or_none(title="Sketch")
                if not sketch_coll:
                    # Creating a default 'Sketch' collection if missing
                    sketch_coll = await self.db.collections.add(ArtworkAdd(title="Sketch"))
                collection_id = sketch_coll.id

            artwork_dict = artwork_data.model_dump()
            artwork_dict["collection_id"] = collection_id
            artwork_dict["slug"] = await self.generate_unique_slug(artwork_data.title)

            artwork = await self.db.artworks.add(ArtworkAdd(**artwork_dict))

            # Map tag associations
            artwork_tags = [
                ArtworkTagAdd(artwork_id=artwork.id, tag_id=tag_id) for tag_id in artwork_data.tags
            ]
            if artwork_tags:
                await self.db.artwork_tags.add_bulk(artwork_tags)

            await self.db.commit()
        except ObjectAlreadyExistsException:
            raise
        except SQLAlchemyError:
            await self.db.rollback()
            raise DatabaseException
        logger.info("Artwork created: id={}", artwork.id)
        return artwork

    async def update_artwork(self, artwork_id: int, artwork_data: ArtworkAddRequest):
        """
        Performs a full update of an artwork record.
        Maintains immutable fields like images (via separate API) and slugs.
        Synchronizes tag associations.
        """
        # Verify artwork exists
        existing = await self.db.artworks.get_one(id=artwork_id)

        try:
            # Exclude fields managed by specialized endpoints or immutable logic
            artwork_dict = artwork_data.model_dump()
            artwork_dict.pop("images", None)
            artwork_dict.pop("tags", None)
            artwork_dict.pop("slug", None)

            # Reattach preserved fields
            artwork_dict["slug"] = existing.slug
            artwork_dict["images"] = existing.images

            await self.db.artworks.edit(ArtworkAdd(**artwork_dict), id=artwork_id)
            await self.db.artwork_tags.set_artwork_tags(artwork_id, artwork_data.tags)
            await self.db.commit()
        except SQLAlchemyError:
            await self.db.rollback()
            raise DatabaseException
        logger.info("Artwork updated: id={}", artwork_id)

    async def update_artwork_partially(self, artwork_id: int, artwork_data: ArtworkPatchRequest):
        """
        Updates only the specified fields of an artwork record.
        Handles partial metadata and tag updates.
        """
        artwork_data_dict = artwork_data.model_dump(exclude_unset=True)
        # Verify artwork existence
        await self.db.artworks.get_one(id=artwork_id)

        try:
            _artwork_data = ArtworkPatch(**artwork_data_dict)
            await self.db.artworks.edit(_artwork_data, exclude_unset=True, id=artwork_id)
            if "tags" in artwork_data_dict:
                await self.db.artwork_tags.set_artwork_tags(artwork_id, artwork_data.tags)
            await self.db.commit()
        except SQLAlchemyError:
            await self.db.rollback()
            raise DatabaseException
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
