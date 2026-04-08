"""
Service layer for artwork collection business logic.
Handles grouping of artworks and associated categorization metadata.
"""

from sqlalchemy.exc import SQLAlchemyError

from src.exeptions import DatabaseException, ObjectAlreadyExistsException
from src.schemas.collections import CollectionAdd
from src.services.base import BaseService


class CollectionService(BaseService):
    """
    Provides methods for managing collection entities.
    Ensures data integrity during creation and deletion of artwork groups.
    """

    async def get_all_collections(self):
        """
        Retrieves all defined artwork collections from the database.
        """
        try:
            return await self.db.collections.get_all()
        except SQLAlchemyError:
            raise DatabaseException

    async def create_collection(self, collection_data: CollectionAdd):
        """
        Creates a new artwork collection.
        Handles unique constraint violations and database errors.
        """
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
        """
        Deletes an artwork collection by its individual ID.
        Verifies existence before attempting deletion.
        """
        # Ensure collection exists before deletion
        await self.db.collections.get_one(id=collection_id)
        try:
            await self.db.collections.delete(id=collection_id)
            await self.db.commit()
        except SQLAlchemyError:
            await self.db.rollback()
            raise DatabaseException

    async def update_collection(self, collection_id: int, collection_data):
        """
        Updates metadata for an existing collection.
        Uses partial updates (excluding unset fields) to preserve existing data.
        """
        # Ensure collection exists
        await self.db.collections.get_one(id=collection_id)
        try:
            await self.db.collections.edit(collection_data, exclude_unset=True, id=collection_id)
            await self.db.commit()
        except SQLAlchemyError:
            await self.db.rollback()
            raise DatabaseException
