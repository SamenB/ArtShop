"""
Service layer for order processing and management.
Handles complex checkout logic including inventory checks for original artworks,
print availability verification, and multi-entity transaction management.
"""

from datetime import datetime, timezone

from loguru import logger
from sqlalchemy.exc import SQLAlchemyError

from src.exeptions import (
    DatabaseException,
    InvalidDataException,
    ObjectAlreadyExistsException,
    ObjectNotFoundException,
    OriginalSoldOutException,
    PrintsSoldOutException,
)
from src.integrations.prodigi.services.prodigi_order_rehydration import (
    ProdigiOrderRehydrationError,
    ProdigiOrderRehydrationService,
)
from src.models.orders import OrdersOrm
from src.models.site_settings import SiteSettingsOrm
from src.print_on_demand import get_print_provider
from src.schemas.artworks import ArtworkPatch
from src.schemas.orders import (
    EditionType,
    FulfillmentStatus,
    FulfillmentStatusUpdate,
    OrderAdd,
    OrderAddRequest,
    OrderBulkRequest,
    OrderItemAdd,
    OrderPatch,
    build_tracking_url,
)
from src.services.base import BaseService

# Maps fulfillment_status â†’ which timestamp column to set
FULFILLMENT_TIMESTAMP_MAP: dict[str, str] = {
    FulfillmentStatus.CONFIRMED: "confirmed_at",
    FulfillmentStatus.PRINT_ORDERED: "print_ordered_at",
    FulfillmentStatus.PRINT_RECEIVED: "print_received_at",
    FulfillmentStatus.SHIPPED: "shipped_at",
    FulfillmentStatus.DELIVERED: "delivered_at",
}

# Statuses where we suppress customer email (internal pipeline steps)
_SILENT_FULFILLMENT_STATUSES = {"print_received", "packaging"}


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

    async def get_orders_by_email(self, email: str):
        """
        Retrieves all orders associated with a given email address.
        Used for guest order tracking â€” no authentication required.
        """
        try:
            return await self.db.orders.get_filtered(email=email)
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
                # Shipping address
                shipping_country=order_data.shipping_country,
                shipping_country_code=order_data.shipping_country_code,
                shipping_state=order_data.shipping_state,
                shipping_city=order_data.shipping_city,
                shipping_address_line1=order_data.shipping_address_line1,
                shipping_address_line2=order_data.shipping_address_line2,
                shipping_postal_code=order_data.shipping_postal_code,
                shipping_phone=order_data.shipping_phone,
                shipping_notes=order_data.shipping_notes,
                # Meta
                newsletter_opt_in=order_data.newsletter_opt_in,
                discovery_source=order_data.discovery_source,
                promo_code=order_data.promo_code,
                total_price=sum(item.price for item in order_data.items),
                items=[],
            )

            order = await self.db.orders.add(order_add)
            rehydration_service = ProdigiOrderRehydrationService(self.db)
            recalculated_total_price = 0

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

                else:
                    # Prints â€” verify the specific print type is enabled for this artwork.
                    # EditionType.artwork_availability_flag maps type â†’ model flag name.
                    flag_name = item_data.edition_type.artwork_availability_flag
                    if not getattr(artwork, flag_name, False):
                        raise PrintsSoldOutException()

                rehydrated_selection = await rehydration_service.rehydrate_item(
                    artwork=artwork,
                    item_data=item_data,
                    destination_country=order_data.shipping_country_code,
                )

                # 3. Create the linked order item entry
                item_add = OrderItemAdd(
                    order_id=order.id,
                    artwork_id=artwork.id,
                    edition_type=item_data.edition_type,
                    finish=item_data.finish,
                    size=item_data.size,
                    price=item_data.price,
                    prodigi_storefront_offer_size_id=item_data.prodigi_storefront_offer_size_id,
                    prodigi_sku=item_data.prodigi_sku,
                    prodigi_category_id=item_data.prodigi_category_id,
                    prodigi_slot_size_label=item_data.prodigi_slot_size_label,
                    prodigi_attributes=item_data.prodigi_attributes,
                    prodigi_shipping_method=item_data.prodigi_shipping_method,
                    prodigi_wholesale_eur=item_data.prodigi_wholesale_eur,
                    prodigi_shipping_eur=item_data.prodigi_shipping_eur,
                    prodigi_retail_eur=item_data.prodigi_retail_eur,
                )
                rehydration_service.apply_to_item_add(item_add, rehydrated_selection)
                recalculated_total_price += int(item_add.price)
                await self.db.order_items.add(item_add)

            if recalculated_total_price != order.total_price:
                from sqlalchemy import update as sa_update

                await self.db.session.execute(
                    sa_update(OrdersOrm)
                    .where(OrdersOrm.id == order.id)
                    .values(total_price=recalculated_total_price)
                )

            # Atomically commit the order and status changes
            await self.db.commit()

            # Re-fetch the order to include fully populated nested relationships (e.g., items)
            order = await self.db.orders.get_one(id=order.id)

            logger.info("Order created successfully: {}", order)

            # Fire admin Telegram notification in background (non-blocking)
            import asyncio

            from src.connectors.telegram import notify_admin_new_order

            settings_obj = await self.db.session.get(SiteSettingsOrm, 1)
            owner_chat_id = settings_obj.owner_telegram_chat_id if settings_obj else None
            items_summary = "\n".join(f"  - {it.edition_type} - ${it.price}" for it in order.items)
            asyncio.create_task(
                notify_admin_new_order(
                    order_id=order.id,
                    customer_name=f"{order.first_name} {order.last_name}",
                    total=order.total_price,
                    items_summary=items_summary,
                    chat_id=owner_chat_id,
                )
            )

            return order

        except (
            ObjectNotFoundException,
            OriginalSoldOutException,
            PrintsSoldOutException,
            InvalidDataException,
        ):
            await self.db.rollback()
            raise
        except ProdigiOrderRehydrationError as e:
            await self.db.rollback()
            raise InvalidDataException(detail=str(e))
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

    async def _release_original_artworks(self, order) -> None:
        """
        Helper method to revert original artworks within an order back to 'available' status.
        Must be called within a database transaction context before a commit.
        """
        for item in getattr(order, "items", []):
            if item.edition_type == EditionType.ORIGINAL.value:
                # Assuming artwork is already fetched. If not, fetch by artwork_id.
                await self.db.artworks.edit(
                    ArtworkPatch(original_status="available"),
                    exclude_unset=True,
                    id=item.artwork_id,
                )
                logger.info("Released original artwork {} back to inventory", item.artwork_id)

    async def update_payment_status(self, order_id: int, payment_status: str):
        """
        Updates the payment processing status of an existing order.
        If marked as failed or refunded, automatically cancels fulfillment and releases inventory.
        """
        try:
            order = await self.db.orders.get_one(id=order_id)
            values = {"payment_status": payment_status}

            if payment_status in ["failed", "refunded"] and order.fulfillment_status != "cancelled":
                values["fulfillment_status"] = "cancelled"
                await self._release_original_artworks(order)

            # Guard: when admin manually confirms payment:
            # 1. Un-cancel the order (or advance pending) and start fulfillment.
            # 2. Re-lock original artworks as 'sold'.
            if payment_status == "paid":
                if order.fulfillment_status in ["cancelled", "pending"]:
                    values["fulfillment_status"] = FulfillmentStatus.CONFIRMED.value
                    values["confirmed_at"] = datetime.now(timezone.utc).replace(tzinfo=None)
                for item in getattr(order, "items", []):
                    if item.edition_type == EditionType.ORIGINAL.value:
                        await self.db.artworks.edit(
                            ArtworkPatch(original_status="sold"),
                            exclude_unset=True,
                            id=item.artwork_id,
                        )
                        logger.info(
                            "Re-locked artwork {} as 'sold' on manual payment override for order {}",
                            item.artwork_id,
                            order_id,
                        )

            # Use repository edit instead of direct SA update for consistency and testability.
            await self.db.orders.edit(OrderPatch(**values), exclude_unset=True, id=order_id)
            await self.db.commit()
            logger.info(
                "Admin updated payment status of {} to {} (forced)", order_id, payment_status
            )
        except SQLAlchemyError:
            await self.db.rollback()
            raise DatabaseException

    async def update_fulfillment_status(
        self,
        order_id: int,
        update_data: FulfillmentStatusUpdate,
    ) -> None:
        """
        Updates the fulfillment status of an order and auto-sets the corresponding timestamp.

        When the status transitions to 'shipped':
        - tracking_number and carrier are persisted.
        - tracking_url is auto-generated from the carrier template if not manually provided.

        After persisting, fires a transactional email to the customer informing them
        of the status change (via background thread to avoid blocking the response).

        Args:
            order_id: The internal order identifier.
            update_data: FulfillmentStatusUpdate schema with new status and optional tracking.
        """
        try:
            # Fetch order for email notification
            order = await self.db.orders.get_one(id=order_id)

            new_status = update_data.fulfillment_status.value

            # Build the update values dict
            values: dict = {"fulfillment_status": new_status}

            # Auto-set the lifecycle timestamp for this transition
            ts_field = FULFILLMENT_TIMESTAMP_MAP.get(new_status)
            if ts_field:
                values[ts_field] = datetime.now(timezone.utc).replace(tzinfo=None)

            # Revert original artworks back to inventory if the order is cancelled
            if (
                new_status == FulfillmentStatus.CANCELLED.value
                and order.fulfillment_status != FulfillmentStatus.CANCELLED.value
            ):
                await self._release_original_artworks(order)

            # Persist tracking info when provided (typically on 'shipped')
            if update_data.tracking_number is not None:
                values["tracking_number"] = update_data.tracking_number

            if update_data.carrier is not None:
                values["carrier"] = update_data.carrier

            # Auto-generate tracking URL from carrier template
            resolved_carrier = update_data.carrier or order.carrier
            resolved_tracking = update_data.tracking_number or order.tracking_number
            auto_url = build_tracking_url(resolved_carrier, resolved_tracking)
            if auto_url:
                values["tracking_url"] = auto_url

            # Persist admin notes if provided
            if update_data.notes is not None:
                values["notes"] = update_data.notes

            # Use repository edit instead of direct SA update for consistency and testability.
            await self.db.orders.edit(OrderPatch(**values), exclude_unset=True, id=order_id)
            await self.db.commit()

            logger.info(
                "Order {} fulfillment status updated: {} â†’ {}",
                order_id,
                order.fulfillment_status,
                new_status,
            )

            # Load email template from DB *before* spawning a thread
            # (DB session is async and cannot be used inside a sync thread).
            subject_tpl, body_tpl = await self._load_fulfillment_template(new_status)

            # Send customer email notification in background thread
            # (synchronous SMTP wrapped to avoid blocking the event loop)
            self._fire_fulfillment_email(
                order_id=order_id,
                first_name=order.first_name,
                customer_email=order.email,
                fulfillment_status=new_status,
                tracking_number=resolved_tracking,
                carrier=resolved_carrier,
                tracking_url=auto_url or order.tracking_url,
                subject_template=subject_tpl,
                body_template=body_tpl,
            )

        except ObjectNotFoundException:
            raise
        except SQLAlchemyError as e:
            logger.error("Failed to update fulfillment status for order {}: {}", order_id, e)
            await self.db.rollback()
            raise DatabaseException

    async def _load_fulfillment_template(
        self, fulfillment_status: str
    ) -> tuple[str | None, str | None]:
        """
        Fetches subject and body templates for a given fulfillment status from the DB.
        Returns (None, None) for silent/internal statuses or inactive templates.
        """
        if fulfillment_status in _SILENT_FULFILLMENT_STATUSES:
            logger.debug("Suppressing customer email for internal status '{}'", fulfillment_status)
            return None, None

        template = await self.db.email_templates.get_by_key(f"fulfillment_{fulfillment_status}")
        if not template or not template.is_active:
            logger.debug(
                "Email template 'fulfillment_{}' not found or inactive â€” skipping.",
                fulfillment_status,
            )
            return None, None

        return template.subject, template.body

    def _fire_fulfillment_email(
        self,
        order_id: int,
        first_name: str,
        customer_email: str,
        fulfillment_status: str,
        tracking_number: str | None,
        carrier: str | None,
        tracking_url: str | None,
        subject_template: str | None,
        body_template: str | None,
    ) -> None:
        """
        Sends a fulfillment notification email in a background thread.
        Template strings are pre-loaded from DB in async context and passed in
        to avoid running async code inside a sync thread.
        """
        import threading

        from src.services.email import send_fulfillment_status_email

        thread = threading.Thread(
            target=send_fulfillment_status_email,
            kwargs={
                "order_id": order_id,
                "first_name": first_name,
                "customer_email": customer_email,
                "fulfillment_status": fulfillment_status,
                "tracking_number": tracking_number,
                "carrier": carrier,
                "tracking_url": tracking_url,
                "subject_template": subject_template,
                "body_template": body_template,
            },
            daemon=True,
        )
        thread.start()

    async def link_payment_session(self, order_id: int, invoice_id: str, payment_url: str) -> None:
        """
        Associates a Monobank payment session with an existing order.

        Stores the external invoice_id and payment page URL, and transitions
        the order's payment status to 'awaiting_payment'.

        Args:
            order_id: The internal order identifier.
            invoice_id: The Monobank-assigned invoice identifier.
            payment_url: The Monobank-hosted payment page URL.
        """
        try:
            from sqlalchemy import update as sa_update

            update_stmt = (
                sa_update(self.db.orders.model)
                .filter_by(id=order_id)
                .values(
                    invoice_id=invoice_id,
                    payment_url=payment_url,
                    payment_status="awaiting_payment",
                )
            )
            await self.db.session.execute(update_stmt)
            await self.db.commit()
        except SQLAlchemyError as e:
            logger.error("Failed to link payment session for order {}: {}", order_id, e)
            await self.db.rollback()
            raise DatabaseException

    async def update_payment_status_by_invoice(self, invoice_id: str, payment_status: str) -> None:
        """
        Updates the payment status of an order identified by its Monobank invoice_id.

        Used by the webhook handler to process asynchronous status callbacks.
        Terminal statuses ('paid', 'refunded') are protected from downgrade.

        When payment transitions to 'paid', automatically advances the
        fulfillment_status from 'pending' â†’ 'confirmed'.

        Args:
            invoice_id: The Monobank invoice identifier.
            payment_status: The new internal payment status to set.
        """
        try:
            orders = await self.db.orders.get_filtered(invoice_id=invoice_id)
            if not orders:
                logger.warning("No order found for invoice_id: {}", invoice_id)
                return

            order = orders[0]

            # Idempotency guard: don't downgrade terminal statuses.
            terminal_statuses = {"paid", "refunded"}
            if order.payment_status in terminal_statuses and payment_status != "refunded":
                logger.info(
                    "Skipping status update for order {}: already in terminal state '{}'",
                    order.id,
                    order.payment_status,
                )
                return

            values: dict = {"payment_status": payment_status}

            # If payment is confirmed, auto-advance fulfillment to 'confirmed'
            if payment_status == "paid" and order.fulfillment_status == "pending":
                values["fulfillment_status"] = FulfillmentStatus.CONFIRMED.value
                values["confirmed_at"] = datetime.now(timezone.utc).replace(tzinfo=None)
                logger.info(
                    "Auto-advancing fulfillment for order {} pending â†’ confirmed on payment",
                    order.id,
                )

            # Guard: re-lock original artworks as 'sold' when payment is confirmed.
            # This protects against race conditions where the abandoned-orders cleanup
            # may have briefly released originals before payment arrived.
            if payment_status == "paid":
                for item in getattr(order, "items", []):
                    if item.edition_type == EditionType.ORIGINAL.value:
                        await self.db.artworks.edit(
                            ArtworkPatch(original_status="sold"),
                            exclude_unset=True,
                            id=item.artwork_id,
                        )
                        logger.info(
                            "Re-locked original artwork {} as 'sold' on payment confirmation for order {}",
                            item.artwork_id,
                            order.id,
                        )

            # If payment failed/refunded, cancel fulfillment and release original artworks
            if payment_status in ["failed", "refunded"] and order.fulfillment_status != "cancelled":
                values["fulfillment_status"] = FulfillmentStatus.CANCELLED.value
                await self._release_original_artworks(order)
                logger.info(
                    "Auto-cancelled fulfillment and released originals for order {} due to payment failure",
                    order.id,
                )

            await self.db.orders.edit(OrderPatch(**values), exclude_unset=True, id=order.id)

            # Submit print-on-demand items through the active provider boundary.
            if payment_status == "paid" and await self._prodigi_auto_fulfillment_enabled():
                if self._print_provider_cost_is_covered(order):
                    await get_print_provider().submit_paid_order_items(
                        order=order,
                        db_session=self.db.session,
                    )
                else:
                    logger.warning(
                        "Prodigi auto fulfillment blocked for order {}: supplier cost exceeds paid total.",
                        order.id,
                    )
            elif payment_status == "paid":
                logger.info(
                    "Prodigi auto fulfillment is disabled; order {} is awaiting manual submit.",
                    order.id,
                )

            await self.db.commit()

            logger.info(
                "Order {} payment status updated by webhook: {} â†’ {}",
                order.id,
                order.payment_status,
                payment_status,
            )

            # Notify customer when payment is confirmed
            if payment_status == "paid" and order.payment_status not in terminal_statuses:
                subject_tpl, body_tpl = await self._load_fulfillment_template("confirmed")
                self._fire_fulfillment_email(
                    order_id=order.id,
                    first_name=order.first_name,
                    customer_email=order.email,
                    fulfillment_status="confirmed",
                    tracking_number=None,
                    carrier=None,
                    tracking_url=None,
                    subject_template=subject_tpl,
                    body_template=body_tpl,
                )

        except SQLAlchemyError as e:
            logger.error("Failed to update payment status for invoice {}: {}", invoice_id, e)
            await self.db.rollback()
            raise DatabaseException

    async def submit_order_to_print_provider(self, order_id: int) -> None:
        """
        Manually submits paid print items to the active print provider.

        This is the admin-controlled path used when Prodigi fulfillment mode is manual.
        The provider service remains idempotent through its stable fulfillment job key.
        """
        try:
            order = await self.db.orders.get_one(id=order_id)
            if order.payment_status not in {"paid", "mock_paid"}:
                raise InvalidDataException(
                    detail="Order must be paid before it can be submitted to Prodigi."
                )
            if not self._print_provider_cost_is_covered(order):
                summary = self._print_provider_cost_summary(order)
                raise InvalidDataException(
                    detail=(
                        "Prodigi submission blocked: supplier total "
                        f"EUR {summary['supplier_total']:.2f} exceeds customer paid "
                        f"${summary['customer_paid']:.2f}."
                    )
                )
            await get_print_provider().submit_paid_order_items(
                order=order,
                db_session=self.db.session,
            )
            await self.db.commit()
        except SQLAlchemyError:
            await self.db.rollback()
            raise DatabaseException

    async def _prodigi_auto_fulfillment_enabled(self) -> bool:
        settings_obj = await self.db.session.get(SiteSettingsOrm, 1)
        if settings_obj is None:
            return True
        return (settings_obj.prodigi_fulfillment_mode or "automatic") == "automatic"

    def _print_provider_cost_summary(self, order) -> dict[str, float]:
        supplier_total = 0.0
        for item in getattr(order, "items", []) or []:
            supplier_total += float(item.prodigi_wholesale_eur or 0)
            supplier_total += float(item.prodigi_shipping_eur or 0)
        return {
            "customer_paid": float(order.total_price or 0),
            "supplier_total": supplier_total,
        }

    def _print_provider_cost_is_covered(self, order) -> bool:
        summary = self._print_provider_cost_summary(order)
        if summary["supplier_total"] <= 0:
            return True
        return summary["supplier_total"] <= summary["customer_paid"]

    async def delete_order(self, order_id: int):
        """
        Deletes an order and its items.
        If the order contained original artworks, their status is reverted to 'available'.
        """
        try:
            order = await self.db.orders.get_one(id=order_id)

            # Revert artwork status for originals
            for item in order.items:
                if item.edition_type == EditionType.ORIGINAL:
                    await self.db.artworks.edit(
                        ArtworkPatch(original_status="available"),
                        exclude_unset=True,
                        id=item.artwork_id,
                    )

            # Delete order items first (due to FK constraints)
            await self.db.order_items.delete(order_id=order_id)
            await self.db.orders.delete(id=order_id)

            await self.db.commit()
            logger.info("Order deleted successfully: {}", order_id)
        except ObjectNotFoundException:
            raise
        except SQLAlchemyError as e:
            logger.error("Failed to delete order {}: {}", order_id, e)
            await self.db.rollback()
            raise DatabaseException

    async def patch_order(self, order_id: int, data: OrderPatch):
        """
        Applies partial updates to an order.
        If payment_status is included, delegates to update_payment_status
        to ensure artwork inventory is properly synced (sold/available).
        """
        try:
            # If payment_status is being changed, run full business logic
            # (artwork lock/release) via the dedicated method instead of raw edit.
            if data.payment_status is not None:
                payment_status = data.payment_status
                # Create a copy where payment_status is UNSET (not just None)
                # to avoid accidental Ð·Ð°Ñ‚Ð¸Ñ€Ð°Ð½Ð¸Ðµ in the next .edit() call.
                update_dict = data.model_dump(exclude={"payment_status"}, exclude_unset=True)
                if update_dict:
                    patch_without_payment = OrderPatch(**update_dict)
                    await self.db.orders.edit(
                        patch_without_payment, exclude_unset=True, id=order_id
                    )
                # Delegate payment_status change to the method with full business logic
                await self.update_payment_status(order_id, payment_status)
                return

            await self.db.orders.edit(data, exclude_unset=True, id=order_id)
            await self.db.commit()
            logger.info("Order patched successfully: {}", order_id)
        except SQLAlchemyError as e:
            logger.error("Failed to patch order {}: {}", order_id, e)
            await self.db.rollback()
            raise DatabaseException

    async def run_abandoned_orders_cleanup(self, timeout_hours: int = 2) -> int:
        """
        Finds orders stuck in 'pending' or 'awaiting_payment' older than `timeout_hours`,
        cancels them, and releases any original artworks back to inventory.
        Intended for cron / celery beat execution.
        """
        try:
            abandoned_orders = await self.db.orders.get_abandoned_orders(
                timeout_hours=timeout_hours
            )
            if not abandoned_orders:
                return 0

            count = 0
            for order in abandoned_orders:
                try:
                    await self._release_original_artworks(order)
                    await self.db.orders.edit(
                        OrderPatch(
                            payment_status="failed",
                            fulfillment_status="cancelled",
                            notes=f"Auto-cancelled: Abandoned checkout timeout ({timeout_hours}h)",
                        ),
                        exclude_unset=True,
                        id=order.id,
                    )
                    await self.db.commit()
                    count += 1
                except Exception as e:
                    logger.error("Failed to release abandoned order {}: {}", order.id, e)
                    await self.db.rollback()

            logger.info("Abandoned orders cleanup complete. Cancelled {} orders.", count)
            return count
        except Exception as e:
            logger.error("Error running abandoned orders cleanup: {}", e)
            return 0

