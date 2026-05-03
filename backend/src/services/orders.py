"""
Service layer for order processing and management.
Handles complex checkout logic including inventory checks for original artworks,
print availability verification, and multi-entity transaction management.
"""

from datetime import datetime, timezone
from uuid import uuid4

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
from src.utils.order_public_code import public_order_code

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

    def _validate_prodigi_destination_country(
        self,
        item_data: OrderItemAdd | object,
        shipping_country_code: str | None,
    ) -> None:
        expected = getattr(item_data, "prodigi_destination_country_code", None)
        if not expected:
            raise InvalidDataException(
                detail=(
                    "Print item is missing the Prodigi destination country used for pricing. "
                    "Please select the print again for the delivery country."
                )
            )
        actual = (shipping_country_code or "").strip().upper()
        expected = str(expected).strip().upper()
        if actual != expected:
            raise InvalidDataException(
                detail=(
                    "Selected print offer was priced for "
                    f"{expected}, but checkout shipping country is {actual or 'missing'}. "
                    "Please return to the product page and select prints for the delivery country."
                )
            )

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
            item_groups = self._build_checkout_item_groups(order_data.items)
            checkout_group_id = str(uuid4()) if len(item_groups) > 1 else None
            created_order_ids: list[int] = []

            for checkout_segment, items in item_groups:
                order = await self._create_order_record(
                    order_data=order_data,
                    user_id=user_id,
                    items=items,
                    checkout_group_id=checkout_group_id,
                    checkout_segment=checkout_segment if checkout_group_id else None,
                )
                created_order_ids.append(order.id)

            await self.db.commit()

            created_orders = [
                await self.db.orders.get_one(id=order_id) for order_id in created_order_ids
            ]
            order = created_orders[0]

            logger.info(
                "Order checkout created successfully: order_ids={} checkout_group_id={}",
                created_order_ids,
                checkout_group_id,
            )

            await self._notify_admin_created_orders(created_orders)

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

    def _build_checkout_item_groups(
        self, items: list[OrderItemAdd] | list[object]
    ) -> list[tuple[str, list[object]]]:
        if not items:
            raise InvalidDataException(detail="Order must contain at least one item.")
        originals = [item for item in items if item.edition_type == EditionType.ORIGINAL]
        prints = [item for item in items if item.edition_type != EditionType.ORIGINAL]
        if originals and prints:
            return [("originals", originals), ("prints", prints)]
        if originals:
            return [("originals", originals)]
        return [("prints", prints)]

    def _build_order_add(
        self,
        *,
        order_data: OrderAddRequest,
        user_id: int | None,
        checkout_group_id: str | None,
        checkout_segment: str | None,
    ) -> OrderAdd:
        return OrderAdd(
            user_id=user_id,
            first_name=order_data.first_name,
            last_name=order_data.last_name,
            email=order_data.email,
            phone=order_data.phone,
            shipping_country=order_data.shipping_country,
            shipping_country_code=order_data.shipping_country_code,
            shipping_state=order_data.shipping_state,
            shipping_city=order_data.shipping_city,
            shipping_address_line1=order_data.shipping_address_line1,
            shipping_address_line2=order_data.shipping_address_line2,
            shipping_postal_code=order_data.shipping_postal_code,
            shipping_phone=order_data.shipping_phone,
            shipping_notes=order_data.shipping_notes,
            newsletter_opt_in=order_data.newsletter_opt_in,
            discovery_source=order_data.discovery_source,
            promo_code=order_data.promo_code,
            checkout_group_id=checkout_group_id,
            checkout_segment=checkout_segment,
            subtotal_price=0,
            shipping_price=0,
            discount_price=0,
            total_price=0,
            items=[],
        )

    async def _create_order_record(
        self,
        *,
        order_data: OrderAddRequest,
        user_id: int | None,
        items: list[object],
        checkout_group_id: str | None,
        checkout_segment: str | None,
    ):
        order = await self.db.orders.add(
            self._build_order_add(
                order_data=order_data,
                user_id=user_id,
                checkout_group_id=checkout_group_id,
                checkout_segment=checkout_segment,
            )
        )
        rehydration_service = ProdigiOrderRehydrationService(self.db)
        customer_product_subtotal = 0
        customer_shipping_total = 0
        print_product_subtotal = 0

        for item_data in items:
            artwork = await self.db.artworks.get_one(id=item_data.artwork_id)
            is_original = item_data.edition_type == EditionType.ORIGINAL

            if is_original:
                if artwork.original_status != "available":
                    raise OriginalSoldOutException()
                original_price = int(artwork.original_price or item_data.price or 0)
                await self.db.artworks.edit(
                    ArtworkPatch(original_status="sold"), exclude_unset=True, id=artwork.id
                )
                rehydrated_selection = None
            else:
                flag_name = item_data.edition_type.artwork_availability_flag
                if not getattr(artwork, flag_name, False):
                    raise PrintsSoldOutException()
                self._validate_prodigi_destination_country(
                    item_data,
                    order_data.shipping_country_code,
                )
                rehydrated_selection = await rehydration_service.rehydrate_item(
                    artwork=artwork,
                    item_data=item_data,
                    destination_country=order_data.shipping_country_code,
                )

            item_add = OrderItemAdd(
                order_id=order.id,
                artwork_id=artwork.id,
                edition_type=item_data.edition_type,
                finish=item_data.finish,
                size=item_data.size,
                price=item_data.price if is_original else 0,
                customer_product_price=item_data.customer_product_price if is_original else None,
                customer_shipping_price=item_data.customer_shipping_price if is_original else None,
                customer_line_total=item_data.customer_line_total if is_original else None,
                customer_currency=(item_data.customer_currency if is_original else "USD") or "USD",
                prodigi_storefront_offer_size_id=item_data.prodigi_storefront_offer_size_id,
                prodigi_sku=item_data.prodigi_sku,
                prodigi_category_id=item_data.prodigi_category_id,
                prodigi_slot_size_label=item_data.prodigi_slot_size_label,
                prodigi_attributes=item_data.prodigi_attributes,
                prodigi_shipping_method=None
                if not is_original
                else item_data.prodigi_shipping_method,
                prodigi_wholesale_eur=None,
                prodigi_shipping_eur=None,
                prodigi_supplier_total_eur=None,
                prodigi_retail_eur=None,
                prodigi_supplier_currency=None,
                prodigi_destination_country_code=(
                    item_data.prodigi_destination_country_code or order_data.shipping_country_code
                ),
            )
            if is_original:
                item_add.price = original_price
                item_add.customer_product_price = float(original_price)
                item_add.customer_shipping_price = 0.0
                item_add.customer_line_total = float(original_price)
                item_add.customer_currency = "USD"
            else:
                rehydration_service.apply_to_item_add(item_add, rehydrated_selection)

            customer_product = self._round_customer_amount(
                item_add.customer_product_price
                if item_add.customer_product_price is not None
                else item_add.price
            )
            customer_shipping = self._round_customer_amount(item_add.customer_shipping_price)
            line_total = customer_product + customer_shipping
            item_add.price = line_total
            item_add.customer_product_price = float(customer_product)
            item_add.customer_shipping_price = float(customer_shipping)
            item_add.customer_line_total = float(line_total)
            item_add.customer_currency = item_add.customer_currency or "USD"

            customer_product_subtotal += customer_product
            customer_shipping_total += customer_shipping
            if not is_original:
                print_product_subtotal += customer_product
            await self.db.order_items.add(item_add)

        discount_price = self._calculate_discount_price(
            promo_code=order_data.promo_code,
            print_product_subtotal=print_product_subtotal,
        )
        recalculated_total_price = max(
            0,
            customer_product_subtotal + customer_shipping_total - discount_price,
        )
        self._assert_customer_total_consistency(
            subtotal=customer_product_subtotal,
            shipping=customer_shipping_total,
            discount=discount_price,
            total=recalculated_total_price,
        )
        from sqlalchemy import update as sa_update

        await self.db.session.execute(
            sa_update(OrdersOrm)
            .where(OrdersOrm.id == order.id)
            .values(
                subtotal_price=customer_product_subtotal,
                shipping_price=customer_shipping_total,
                discount_price=discount_price,
                total_price=recalculated_total_price,
            )
        )
        return order

    async def _notify_admin_created_orders(self, orders) -> None:
        import asyncio

        from src.connectors.telegram import notify_admin_new_order

        settings_obj = await self.db.session.get(SiteSettingsOrm, 1)
        owner_chat_id = settings_obj.owner_telegram_chat_id if settings_obj else None
        for order in orders:
            items_summary = "\n".join(f"  - {it.edition_type} - ${it.price}" for it in order.items)
            segment = f" ({order.checkout_segment})" if order.checkout_segment else ""
            asyncio.create_task(
                notify_admin_new_order(
                    order_id=order.id,
                    customer_name=f"{order.first_name} {order.last_name}{segment}",
                    total=order.total_price,
                    items_summary=items_summary,
                    chat_id=owner_chat_id,
                )
            )

    def _round_customer_amount(self, value: float | int | None) -> int:
        if value is None:
            return 0
        return int(float(value) + 0.5)

    def _calculate_discount_price(
        self, *, promo_code: str | None, print_product_subtotal: int
    ) -> int:
        if (promo_code or "").strip().upper() != "ART10":
            return 0
        return self._round_customer_amount(print_product_subtotal * 0.1)

    def _assert_customer_total_consistency(
        self,
        *,
        subtotal: int,
        shipping: int,
        discount: int,
        total: int,
    ) -> None:
        expected = max(0, subtotal + shipping - discount)
        if expected != total:
            raise InvalidDataException(
                detail=(
                    "Order customer totals are inconsistent: "
                    f"subtotal={subtotal}, shipping={shipping}, discount={discount}, total={total}."
                )
            )

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
                order_reference=public_order_code(order_id),
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
        order_reference: str,
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
                "order_reference": order_reference,
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

            order = await self.db.orders.get_one(id=order_id)
            order_ids = [order.id]
            if order.checkout_group_id:
                order_ids = [
                    group_order.id
                    for group_order in await self.db.orders.get_filtered(
                        checkout_group_id=order.checkout_group_id
                    )
                ]

            update_stmt = (
                sa_update(self.db.orders.model)
                .where(self.db.orders.model.id.in_(order_ids))
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

            orders = sorted(orders, key=lambda candidate: candidate.id)
            anchor_order = orders[0]

            # Idempotency guard: don't downgrade terminal statuses.
            terminal_statuses = {"paid", "refunded"}
            notify_payment_confirmed = False
            auto_fulfillment_enabled = (
                await self._prodigi_auto_fulfillment_enabled()
                if payment_status == "paid"
                else False
            )

            for order in orders:
                if order.payment_status in terminal_statuses and payment_status != "refunded":
                    logger.info(
                        "Skipping status update for order {}: already in terminal state '{}'",
                        order.id,
                        order.payment_status,
                    )
                    continue

                if payment_status == "paid" and order.payment_status not in terminal_statuses:
                    notify_payment_confirmed = True

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
                if (
                    payment_status in ["failed", "refunded"]
                    and order.fulfillment_status != "cancelled"
                ):
                    values["fulfillment_status"] = FulfillmentStatus.CANCELLED.value
                    await self._release_original_artworks(order)
                    logger.info(
                        "Auto-cancelled fulfillment and released originals for order {} due to payment failure",
                        order.id,
                    )

                await self.db.orders.edit(OrderPatch(**values), exclude_unset=True, id=order.id)

                # Submit print-on-demand items through the active provider boundary.
                if payment_status == "paid" and auto_fulfillment_enabled:
                    if self._order_has_print_items(order) and self._print_provider_cost_is_covered(
                        order
                    ):
                        await get_print_provider().submit_paid_order_items(
                            order=order,
                            db_session=self.db.session,
                        )
                    elif self._order_has_print_items(order):
                        logger.warning(
                            "Prodigi auto fulfillment blocked for order {}: supplier cost exceeds paid total.",
                            order.id,
                        )
                elif payment_status == "paid" and self._order_has_print_items(order):
                    logger.info(
                        "Prodigi auto fulfillment is disabled; order {} is awaiting manual submit.",
                        order.id,
                    )

            await self.db.commit()

            logger.info(
                "Invoice {} payment status applied to order_ids={}: {}",
                invoice_id,
                [order.id for order in orders],
                payment_status,
            )

            # Notify customer when payment is confirmed
            if payment_status == "paid" and notify_payment_confirmed:
                subject_tpl, body_tpl = await self._load_fulfillment_template("confirmed")
                self._fire_fulfillment_email(
                    order_id=anchor_order.id,
                    order_reference=public_order_code(anchor_order.id),
                    first_name=anchor_order.first_name,
                    customer_email=anchor_order.email,
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
        session_get = getattr(getattr(self.db, "session", None), "get", None)
        if session_get is None:
            return True
        settings_obj = await session_get(SiteSettingsOrm, 1)
        if settings_obj is None:
            return True
        return (settings_obj.prodigi_fulfillment_mode or "automatic") == "automatic"

    def _order_has_print_items(self, order) -> bool:
        return any(
            getattr(item, "edition_type", None) != EditionType.ORIGINAL.value
            for item in (getattr(order, "items", []) or [])
        )

    def _print_provider_cost_summary(self, order) -> dict[str, float]:
        supplier_total = 0.0
        for item in getattr(order, "items", []) or []:
            item_supplier_total = getattr(item, "prodigi_supplier_total_eur", None)
            if item_supplier_total is not None:
                supplier_total += float(item_supplier_total)
            else:
                supplier_total += float(getattr(item, "prodigi_wholesale_eur", None) or 0)
                supplier_total += float(getattr(item, "prodigi_shipping_eur", None) or 0)
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
