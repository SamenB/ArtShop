from loguru import logger
from sqlalchemy.exc import SQLAlchemyError

from src.exeptions import DatabaseException, ObjectAlreadyExistsException
from src.schemas.tags import TagAdd
from src.services.base import BaseService


class TagService(BaseService):
    async def get_all_tags(self):
        try:
            return await self.db.tags.get_all()
        except SQLAlchemyError:
            raise DatabaseException

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
            await self.db.tags.delete(id=tag_id)
            await self.db.commit()
        except SQLAlchemyError:
            await self.db.rollback()
            raise DatabaseException
