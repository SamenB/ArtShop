"""
Service layer for artwork tag business logic.
Handles categorization and metadata tagging for artworks,
including usage tracking and relationship cleanup.
"""

from loguru import logger
from sqlalchemy.exc import SQLAlchemyError

from src.exeptions import DatabaseException, ObjectAlreadyExistsException
from src.schemas.tags import TagAdd
from src.services.base import BaseService


class TagService(BaseService):
    """
    Provides methods for managing tags and their associations with artworks.
    """

    async def get_all_tags(self, category: str | None = None):
        """
        Retrieves all tags, optionally filtered by a specific category (e.g., 'medium').
        """
        try:
            return await self.db.tags.get_all_filtered(category=category)
        except SQLAlchemyError:
            raise DatabaseException

    async def get_tag_usage_count(self, tag_id: int) -> int:
        """
        Calculates how many artworks are currently associated with the specified tag.
        Used for determining tag popularity or impact of deletion.
        """
        try:
            # Retrieve all association rows and return the count.
            rows = await self.db.artwork_tags.get_filtered(tag_id=tag_id)
            return len(rows)
        except SQLAlchemyError:
            return 0

    async def create_tag(self, tag_data: TagAdd):
        """
        Creates a new global tag.
        Ensures uniqueness via database constraints handles in repository.
        """
        try:
            tag = await self.db.tags.add(tag_data)
            await self.db.commit()
            logger.info("Tag created: {}", tag_data.title)
            return tag
        except ObjectAlreadyExistsException:
            raise
        except SQLAlchemyError:
            await self.db.rollback()
            raise DatabaseException

    async def delete_tag(self, tag_id: int):
        """
        Deletes a tag from the system.

        Logic:
        1. Explicitly removes all artwork-tag associations to prevent foreign key violations.
        2. Deletes the tag entity itself.
        3. Commits the atomic transaction.
        """
        try:
            # Perform cascading manual cleanup of associations.
            await self.db.artwork_tags.delete(tag_id=tag_id)
            await self.db.tags.delete(id=tag_id)
            await self.db.commit()
            logger.info("Tag deleted: id={}", tag_id)
        except SQLAlchemyError:
            await self.db.rollback()
            raise DatabaseException
