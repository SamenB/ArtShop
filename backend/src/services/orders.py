"""
Service layer for order processing and management.
Handles complex checkout logic including inventory checks for original artworks,
print availability verification, and multi-entity transaction management.
"""

from loguru import logger
from sqlalchemy.exc import SQLAlchemyError

from src.exeptions import (
    DatabaseException,
    ObjectAlreadyExistsException,
    ObjectNotFoundException,
    OriginalSoldOutException,
    PrintsSoldOutException,
)
from src.schemas.artworks import ArtworkPatch
from src.schemas.orders import (
    EditionType,
    OrderAdd,
    OrderAddRequest,
    OrderBulkRequest,
    OrderItemAdd,
)
from src.services.base import BaseService


class OrderService(BaseService):
    """
    Provides high-level methods for order lifecycle management.
    Ensures that artwork status is correctly synchronized with sales.
    """

    async def get_all_orders(self):
        """
        Retrieves all orders from the database for administrative purposes.
        """
        try:
            return await self.db.orders.get_all()
        except SQLAlchemyError:
            raise DatabaseException

    async def get_my_orders(self, user_id: int):
        """
        Retrieves a list of orders associated with a specific user.
        """
        try:
            return await self.db.orders.get_filtered(user_id=user_id)
        except SQLAlchemyError:
            raise DatabaseException

    async def create_order(self, order_data: OrderAddRequest, user_id: int | None):
        """
        Processes a new order placement.

        Logic:
        1. Validates availability of each item (original vs print).
        2. Updates artwork status to 'sold' if an original is purchased.
        3. Calculates total price and persists the main order entry.
        4. Persists individual order items linked to the main order.
        5. Commits the transaction if all steps succeed; rolls back otherwise.
        """
        try:
            # 1. Initialize the main order entry with calculated totals
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

            # 2. Process and validate each item in the order
            for item_data in order_data.items:
                artwork = await self.db.artworks.get_one(id=item_data.artwork_id)

                if item_data.edition_type == EditionType.ORIGINAL:
                    # Original artworks must be 'available' to be sold
                    if artwork.original_status != "available":
                        raise OriginalSoldOutException()

                    # Mark original as sold immediately to prevent double-booking
                    await self.db.artworks.edit(
                        ArtworkPatch(original_status="sold"), exclude_unset=True, id=artwork.id
                    )

                elif item_data.edition_type == EditionType.PRINT:
                    # Prints must be explicitly enabled for the artwork
                    if not artwork.has_prints:
                        raise PrintsSoldOutException()

                # 3. Create the linked order item entry
                item_add = OrderItemAdd(
                    order_id=order.id,
                    artwork_id=artwork.id,
                    edition_type=item_data.edition_type,
                    finish=item_data.finish,
                    size=item_data.size,
                    price=item_data.price,
                )
                await self.db.order_items.add(item_add)

            # Atomically commit the order and status changes
            await self.db.commit()

            # Re-fetch the order to include fully populated nested relationships (e.g., items)
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
        """
        Inserts multiple order records in bulk.
        Checks for user and artwork existence before adding to the batch.
        """
        try:
            # Map valid IDs for validation
            valid_user_ids = {u.id for u in await self.db.users.get_all()}
            valid_artwork_ids = {a.id for a in await self.db.artworks.get_all()}

            valid_orders = [
                OrderAdd(**o.model_dump())
                for o in orders_data
                if o.user_id in valid_user_ids and o.artwork_id in valid_artwork_ids
            ]

            if valid_orders:
                await self.db.orders.add_bulk(valid_orders)
                await self.db.commit()

            skipped_count = len(orders_data) - len(valid_orders)
            logger.info("Bulk orders: inserted={}, skipped={}", len(valid_orders), skipped_count)
            return {"inserted": len(valid_orders), "skipped": skipped_count}

        except ObjectAlreadyExistsException:
            raise
        except SQLAlchemyError:
            await self.db.rollback()
            raise DatabaseException

    async def get_orders_timeline(self):
        """
        Retrieves all orders formatted for timeline or chronological visualization.
        """
        try:
            return await self.db.orders.get_all()
        except SQLAlchemyError:
            raise DatabaseException

    async def update_payment_status(self, order_id: int, payment_status: str):
        """
        Updates the payment processing status of an existing order.
        """
        try:
            await self.db.orders.edit(
                {"payment_status": payment_status}, exclude_unset=True, id=order_id
            )
            await self.db.commit()
        except SQLAlchemyError:
            await self.db.rollback()
            raise DatabaseException
