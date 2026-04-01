from loguru import logger
from sqlalchemy.exc import SQLAlchemyError

from src.exeptions import (
    DatabaseException,
    ObjectAlreadyExistsException,
    ObjectNotFoundException,
    OriginalSoldOutException,
    PrintsSoldOutException,
)
from src.schemas.orders import EditionType, OrderAdd, OrderAddRequest, OrderBulkRequest
from src.services.base import BaseService


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

    async def create_order(self, order_data: OrderAddRequest, user_id: int | None):
        from src.schemas.artworks import ArtworkPatch
        from src.schemas.orders import OrderAdd, OrderItemAdd

        try:
            # 1. Create the main order entry
            order_add = OrderAdd(
                user_id=user_id,
                first_name=order_data.first_name,
                last_name=order_data.last_name,
                email=order_data.email,
                phone=order_data.phone,
                newsletter_opt_in=order_data.newsletter_opt_in,
                discovery_source=order_data.discovery_source,
                promo_code=order_data.promo_code,
                total_price=sum(item.price for item in order_data.items),
                items=[],
            )

            order = await self.db.orders.add(order_add)

            # 2. Process each item
            for item_data in order_data.items:
                artwork = await self.db.artworks.get_one(id=item_data.artwork_id)

                if item_data.edition_type == EditionType.ORIGINAL:
                    if artwork.original_status != "available":
                        raise OriginalSoldOutException()
                    await self.db.artworks.edit(
                        ArtworkPatch(original_status="sold"), exclude_unset=True, id=artwork.id
                    )

                elif item_data.edition_type == EditionType.PRINT:
                    if not artwork.has_prints:
                        raise PrintsSoldOutException()

                # 3. Create the order item entry
                item_add = OrderItemAdd(
                    order_id=order.id,
                    artwork_id=artwork.id,
                    edition_type=item_data.edition_type,
                    finish=item_data.finish,
                    size=item_data.size,
                    price=item_data.price,
                )
                await self.db.order_items.add(item_add)

            await self.db.commit()

            # Re-fetch so items relationship is populated in the response
            order = await self.db.orders.get_one(id=order.id)

            logger.info("Order created successfully: {}", order)
            return order

        except (
            ObjectNotFoundException,
            OriginalSoldOutException,
            PrintsSoldOutException,
        ):
            await self.db.rollback()
            raise
        except SQLAlchemyError as e:
            logger.error("Database error during order creation: {}", e)
            await self.db.rollback()
            raise DatabaseException

    async def create_orders_bulk(self, orders_data: list[OrderBulkRequest]):
        try:
            valid_user_ids = {u.id for u in await self.db.users.get_all()}
            valid_artwork_ids = {a.id for a in await self.db.artworks.get_all()}

            valid = [
                OrderAdd(**o.model_dump())
                for o in orders_data
                if o.user_id in valid_user_ids and o.artwork_id in valid_artwork_ids
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

    async def update_payment_status(self, order_id: int, payment_status: str):
        try:
            # We pass a dict to db.orders.edit
            await self.db.orders.edit(
                {"payment_status": payment_status}, exclude_unset=True, id=order_id
            )
            await self.db.commit()
        except SQLAlchemyError:
            await self.db.rollback()
            raise DatabaseException
