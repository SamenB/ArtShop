from loguru import logger
from sqlalchemy.exc import SQLAlchemyError

from src.exeptions import DatabaseException, ObjectAlreadyExistsException
from src.schemas.tags import TagAdd
from src.services.base import BaseService


class TagService(BaseService):
    async def get_all_tags(self, category: str | None = None):
        try:
            return await self.db.tags.get_all_filtered(category=category)
        except SQLAlchemyError:
            raise DatabaseException

    async def get_tag_usage_count(self, tag_id: int) -> int:
        """Return how many artworks reference this tag."""
        try:
            # artwork_tags has a delete(**filter_by) — use get_filtered to count
            rows = await self.db.artwork_tags.get_filtered(tag_id=tag_id)
            return len(rows)
        except SQLAlchemyError:
            return 0

    async def create_tag(self, tag_data: TagAdd):
        try:
            tag = await self.db.tags.add(tag_data)
            await self.db.commit()
        except ObjectAlreadyExistsException:
            raise
        except SQLAlchemyError:
            await self.db.rollback()
            raise DatabaseException
        logger.info("Tag created: {}", tag_data.title)
        return tag

    async def delete_tag(self, tag_id: int):
        try:
            # Remove all artwork<->tag associations first to avoid FK constraint violation
            await self.db.artwork_tags.delete(tag_id=tag_id)
            await self.db.tags.delete(id=tag_id)
            await self.db.commit()
        except SQLAlchemyError:
            await self.db.rollback()
            raise DatabaseException
        logger.info("Tag deleted: id={}", tag_id)
