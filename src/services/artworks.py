from datetime import date

from sqlalchemy.exc import SQLAlchemyError
from loguru import logger

from src.exeptions import (
    ObjectNotFoundException,
    ObjectAlreadyExistsException,
    DatabaseException,
)
from src.services.base import BaseService
from src.schemas.artworks import ArtworkAdd, ArtworkAddBulk, ArtworkPatch, ArtworkAddRequest, ArtworkPatchRequest
from src.schemas.tags import ArtworkTagAdd


class ArtworkService(BaseService):
    async def get_artwork_by_id(self, artwork_id: int):
        artwork = await self.db.artworks.get_one(id=artwork_id)
        return artwork

    async def get_all_artworks(self):
        try:
            artworks = await self.db.artworks.get_available_artworks()
        except SQLAlchemyError:
            raise DatabaseException
        logger.info("Artworks retrieved: count={}", len(artworks))
        return artworks

    async def create_artwork(self, artwork_data: ArtworkAddRequest):
        try:
            artwork = await self.db.artworks.add(
                ArtworkAdd(**artwork_data.model_dump())
            )
            artwork_tags = [
                ArtworkTagAdd(artwork_id=artwork.id, tag_id=tag_id)
                for tag_id in artwork_data.tags
            ]
            await self.db.artwork_tags.add_bulk(artwork_tags)
            await self.db.commit()
        except ObjectAlreadyExistsException:
            raise
        except SQLAlchemyError:
            await self.db.rollback()
            raise DatabaseException
        logger.info("Artwork created: id={}", artwork.id)
        return artwork

    async def update_artwork(
        self, artwork_id: int, artwork_data: ArtworkAddRequest
    ):
        # Verify artwork exists
        await self.db.artworks.get_one(id=artwork_id)

        try:
            await self.db.artworks.edit(
                ArtworkAdd(**artwork_data.model_dump()), id=artwork_id
            )
            await self.db.artwork_tags.set_artwork_tags(artwork_id, artwork_data.tags)
            await self.db.commit()
        except SQLAlchemyError:
            await self.db.rollback()
            raise DatabaseException
        logger.info("Artwork updated: id={}", artwork_id)

    async def update_artwork_partially(self, artwork_id: int, artwork_data: ArtworkPatchRequest):
        artwork_data_dict = artwork_data.model_dump(exclude_unset=True)
        # Verify artwork exists
        artwork = await self.db.artworks.get_one(id=artwork_id)

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
