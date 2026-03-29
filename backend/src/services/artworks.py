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
    async def get_artwork_by_id(self, artwork_id: int):
        artwork = await self.db.artworks.get_one(id=artwork_id)
        return artwork

    async def get_all_artworks(
        self,
        limit: int = 10,
        offset: int = 0,
        title: str | None = None,
        tags: list[int] | None = None,
    ):
        try:
            artworks = await self.db.artworks.get_available_artworks(
                limit=limit, offset=offset, title=title, tags=tags
            )
        except SQLAlchemyError:
            raise DatabaseException
        logger.info(f"Artworks retrieved: count={len(artworks)}, title={title}, tags={tags}")
        return artworks

    async def create_artwork(self, artwork_data: ArtworkAddRequest):
        try:
            # Handle collection
            collection_id = artwork_data.collection_id
            if collection_id is None:
                sketch_coll = await self.db.collections.get_one_or_none(title="Sketch")
                if not sketch_coll:
                    sketch_coll = await self.db.collections.add(
                        ArtworkAdd(title="Sketch")
                    )  # Use dict or proper schema if needed, but repository usually takes dict/schema
                    # Actually repository add takes pydantic model or dict.
                    # CollectionAdd schema is better
                collection_id = sketch_coll.id

            artwork_dict = artwork_data.model_dump()
            artwork_dict["collection_id"] = collection_id

            artwork = await self.db.artworks.add(ArtworkAdd(**artwork_dict))
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
        # Verify artwork exists
        await self.db.artworks.get_one(id=artwork_id)

        try:
            await self.db.artworks.edit(ArtworkAdd(**artwork_data.model_dump()), id=artwork_id)
            await self.db.artwork_tags.set_artwork_tags(artwork_id, artwork_data.tags)
            await self.db.commit()
        except SQLAlchemyError:
            await self.db.rollback()
            raise DatabaseException
        logger.info("Artwork updated: id={}", artwork_id)

    async def update_artwork_partially(self, artwork_id: int, artwork_data: ArtworkPatchRequest):
        artwork_data_dict = artwork_data.model_dump(exclude_unset=True)
        # Verify artwork exists (raises ObjectNotFoundException if not found)
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
        # Verify artwork exists
        await self.db.artworks.get_one(id=artwork_id)

        try:
            await self.db.artworks.delete(id=artwork_id)
            await self.db.commit()
        except SQLAlchemyError:
            await self.db.rollback()
            raise DatabaseException
        logger.info("Artwork deleted: id={}", artwork_id)

    async def create_artworks_bulk(self, artworks_data: list[ArtworkAddBulk]):

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
