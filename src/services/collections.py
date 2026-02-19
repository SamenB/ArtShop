from datetime import date

from sqlalchemy.exc import SQLAlchemyError
from loguru import logger

from src.exeptions import (
    ObjectNotFoundException,
    ObjectAlreadyExistsException,
    DatabaseException,
)
from src.services.base import BaseService
from src.schemas.collections import CollectionAdd, CollectionPatch
from src.services.images import ImageService




class CollectionService(BaseService):
    async def get_all_collections(
        self,
        available: bool,
        title: str | None,
        location: str | None,
        per_page: int,
        offset: int,
    ):
        try:
            collections = await self.db.collections.get_available_collections(
                available=available,
                title=title,
                location=location,
                limit=per_page,
                offset=offset,
            )
        except SQLAlchemyError:
            raise DatabaseException
        return collections


    async def get_collection_by_id(self, collection_id: int):
        collection = await self.db.collections.get_one(id=collection_id)
        if not collection:
            raise ObjectNotFoundException("Collection not found")
        return collection

    async def create_collection(self, collection_data: CollectionAdd | list[CollectionAdd]):
        try:
            await self.db.collections.add(collection_data)
            await self.db.commit()
        except ObjectAlreadyExistsException:
            raise
        except SQLAlchemyError:
            await self.db.rollback()
            raise DatabaseException
        logger.info("Collection created: {}", collection_data)

    async def update_collection(self, collection_id: int, collection_data: CollectionAdd):
        try:
            await self.db.collections.edit(collection_data, id=collection_id)
            await self.db.commit()
        except SQLAlchemyError:
            await self.db.rollback()
            raise DatabaseException
        logger.info("Collection updated: id={}", collection_id)

    async def update_collection_partially(
        self, collection_id: int, collection_data: CollectionPatch
    ):
        try:
            await self.db.collections.edit(collection_data, exclude_unset=True, id=collection_id)
            await self.db.commit()
        except SQLAlchemyError:
            await self.db.rollback()
            raise DatabaseException
        logger.info("Collection partially updated: id={}", collection_id)

    async def delete_collection(self, collection_id: int):
        try:
            await self.db.collections.delete(id=collection_id)
            await self.db.commit()
        except SQLAlchemyError:
            await self.db.rollback()
            raise DatabaseException
        logger.info("Collection deleted: id={}", collection_id)

    async def get_collection_images(self, collection_id: int):
        collection = await self.db.collections.get_one_or_none(id=collection_id)
        if not collection:
            raise ObjectNotFoundException("Collection not found")
        return collection.images or []

    @staticmethod
    def upload_collection_image(collection_id: int, file):
        ImageService.save_and_process_collection_image(collection_id, file)
        logger.info(
            "Image uploaded for collection_id={}, filename={}",
            collection_id,
            file.filename,
        )
