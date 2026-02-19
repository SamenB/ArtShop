from sqlalchemy.exc import SQLAlchemyError
from loguru import logger

from src.exeptions import (
    ObjectNotFoundException,
    AllArtworksSoldOutException,
    ObjectAlreadyExistsException,
    DatabaseException,
)
from src.services.base import BaseService
from src.schemas.orders import OrderAddRequest, OrderAdd, OrderBulkRequest


class OrderService(BaseService):
    async def get_all_orders(self):
        try:
            return await self.db.orders.get_all()
        except SQLAlchemyError:
            raise DatabaseException

    async def get_my_orders(self, user_id: int):
        try:
            return await self.db.orders.get_filtered(user_id=user_id)
        except SQLAlchemyError:
            raise DatabaseException

    async def create_order(self, order_data: OrderAddRequest, user_id: int):
        try:
            order = await self.db.orders.create_order(order_data, user_id, self.db)
            await self.db.commit()
        except (ObjectNotFoundException, AllArtworksSoldOutException):
            raise
        except SQLAlchemyError:
            await self.db.rollback()
            raise DatabaseException
        logger.info("Order created: {}", order)
        return order

    async def create_orders_bulk(self, orders_data: list[OrderBulkRequest]):
        try:
            valid_user_ids = {u.id for u in await self.db.users.get_all()}
            valid_collection_ids = {c.id for c in await self.db.collections.get_filtered()}
            valid_artwork_ids = {a.id for a in await self.db.artworks.get_all()}

            valid = [
                OrderAdd(**o.model_dump())
                for o in orders_data
                if o.user_id in valid_user_ids
                and o.collection_id in valid_collection_ids
                and o.artwork_id in valid_artwork_ids
            ]

            if valid:
                await self.db.orders.add_bulk(valid)
                await self.db.commit()
        except ObjectAlreadyExistsException:
            raise
        except SQLAlchemyError:
            await self.db.rollback()
            raise DatabaseException

        skipped = len(orders_data) - len(valid)
        logger.info("Bulk orders: inserted={}, skipped={}", len(valid), skipped)
        return {"inserted": len(valid), "skipped": skipped}

    async def get_orders_timeline(self):
        """Get all orders for timeline visualization."""
        try:
            return await self.db.orders.get_all()
        except SQLAlchemyError:
            raise DatabaseException
