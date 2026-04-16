from loguru import logger
from sqlalchemy.exc import SQLAlchemyError

from src.exeptions import DatabaseException, ObjectAlreadyExistsException
from src.schemas.labels import LabelAdd, LabelCategoryAdd
from src.services.base import BaseService


class LabelService(BaseService):
    async def get_all_categories(self):
        try:
            return await self.db.label_categories.get_all()
        except SQLAlchemyError:
            raise DatabaseException

    async def create_category(self, cat_data: LabelCategoryAdd):
        try:
            cat = await self.db.label_categories.add(cat_data)
            await self.db.commit()
            return cat
        except ObjectAlreadyExistsException:
            raise
        except SQLAlchemyError:
            await self.db.rollback()
            raise DatabaseException

    async def delete_category(self, id: int):
        try:
            await self.db.label_categories.delete(id=id)
            await self.db.commit()
        except SQLAlchemyError:
            await self.db.rollback()
            raise DatabaseException

    async def get_all_labels(self, category_id: int | None = None):
        try:
            return await self.db.labels.get_all_filtered(category_id=category_id)
        except SQLAlchemyError:
            raise DatabaseException

    async def get_label_usage_count(self, label_id: int) -> int:
        try:
            rows = await self.db.artwork_labels.get_filtered(label_id=label_id)
            return len(rows)
        except SQLAlchemyError:
            return 0

    async def create_label(self, label_data: LabelAdd):
        try:
            label = await self.db.labels.add(label_data)
            await self.db.commit()
            logger.info("Label created: {}", label_data.title)
            return label
        except ObjectAlreadyExistsException:
            raise
        except SQLAlchemyError:
            await self.db.rollback()
            raise DatabaseException

    async def delete_label(self, label_id: int):
        try:
            await self.db.artwork_labels.delete(label_id=label_id)
            await self.db.labels.delete(id=label_id)
            await self.db.commit()
            logger.info("Label deleted: id={}", label_id)
        except SQLAlchemyError:
            await self.db.rollback()
            raise DatabaseException
