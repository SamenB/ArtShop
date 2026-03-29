from sqlalchemy.exc import SQLAlchemyError

from src.exeptions import DatabaseException, ObjectAlreadyExistsException
from src.schemas.collections import CollectionAdd
from src.services.base import BaseService


class CollectionService(BaseService):
    async def get_all_collections(self):
        try:
            return await self.db.collections.get_all()
        except SQLAlchemyError:
            raise DatabaseException

    async def create_collection(self, collection_data: CollectionAdd):
        try:
            collection = await self.db.collections.add(collection_data)
            await self.db.commit()
            return collection
        except ObjectAlreadyExistsException:
            raise
        except SQLAlchemyError:
            await self.db.rollback()
            raise DatabaseException

    async def delete_collection(self, collection_id: int):
        await self.db.collections.get_one(id=collection_id)
        try:
            await self.db.collections.delete(id=collection_id)
            await self.db.commit()
        except SQLAlchemyError:
            await self.db.rollback()
            raise DatabaseException

    async def update_collection(self, collection_id: int, collection_data):
        await self.db.collections.get_one(id=collection_id)
        try:
            await self.db.collections.edit(collection_data, exclude_unset=True, id=collection_id)
            await self.db.commit()
        except SQLAlchemyError:
            await self.db.rollback()
            raise DatabaseException
