from sqlalchemy.exc import SQLAlchemyError
from loguru import logger

from src.exeptions import (
    ObjectNotFoundException,
    ArtworkDisplayOnlyException,
    OriginalSoldOutException,
    PrintsSoldOutException,
    ObjectAlreadyExistsException,
    DatabaseException,
)
from src.services.base import BaseService
from src.schemas.orders import OrderAddRequest, OrderAdd, OrderBulkRequest, EditionType


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
        from src.schemas.artworks import ArtworkPatch
        try:
            artwork = await self.db.artworks.get_one(id=order_data.artwork_id)

            if artwork.is_display_only:
                raise ArtworkDisplayOnlyException()

            if order_data.edition_type == EditionType.ORIGINAL:
                if not artwork.is_original_available:
                    raise OriginalSoldOutException()
                price = artwork.original_price or 0
                await self.db.artworks.edit(ArtworkPatch(is_original_available=False), exclude_unset=True, id=artwork.id)

            elif order_data.edition_type == EditionType.PRINT:
                if artwork.prints_available <= 0:
                    raise PrintsSoldOutException()
                price = artwork.print_price or 0
                await self.db.artworks.edit(ArtworkPatch(prints_available=artwork.prints_available - 1), exclude_unset=True, id=artwork.id)

            order_add = OrderAdd(
                user_id=user_id,
                artwork_id=artwork.id,
                edition_type=order_data.edition_type,
                price=price
            )

            order = await self.db.orders.add(order_add)
            await self.db.commit()
            
        except (ObjectNotFoundException, ArtworkDisplayOnlyException, OriginalSoldOutException, PrintsSoldOutException):
            raise
        except SQLAlchemyError:
            await self.db.rollback()
            raise DatabaseException
        logger.info("Order created: {}", order)
        return order

    async def create_orders_bulk(self, orders_data: list[OrderBulkRequest]):
        try:
            valid_user_ids = {u.id for u in await self.db.users.get_all()}
            valid_artwork_ids = {a.id for a in await self.db.artworks.get_all()}

            valid = [
                OrderAdd(**o.model_dump())
                for o in orders_data
                if o.user_id in valid_user_ids
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
