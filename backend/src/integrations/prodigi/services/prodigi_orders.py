import logging
from typing import Any
from uuid import uuid4

from src.config import settings
from src.integrations.prodigi.connectors.client import ProdigiClient
from src.integrations.prodigi.services.prodigi_order_assets import ProdigiOrderAssetService
from src.models.orders import OrdersOrm

log = logging.getLogger(__name__)

class ProdigiOrderService:
    @staticmethod
    async def submit_order_items(order: OrdersOrm, db_session) -> None:
        """
        Submits order items to Prodigi if they have prodigi_sku.
        This is called *after* an order has been successfully paid (e.g. from payments webhook).
        """
        print_items = [item for item in order.items if item.prodigi_sku]
        if not print_items:
            log.info(f"No print-on-demand items found for order #{order.id}.")
            return

        async with ProdigiClient() as client:
            for item in print_items:
                log.info(f"Submitting Order #{order.id} Item #{item.id} to Prodigi.")
                category_id = ProdigiOrderService._resolve_category_id(item)
                if not category_id:
                    log.error(
                        "Order item %s is missing a Prodigi category id and could not be inferred.",
                        item.id,
                    )
                    item.prodigi_status = "Failed - Missing Category"
                    continue

                order_asset = await ProdigiOrderAssetService(db_session).prepare_order_asset(
                    order_id=int(order.id),
                    order_item_id=int(item.id),
                    artwork_id=item.artwork_id,
                    category_id=category_id,
                    slot_size_label=getattr(item, "prodigi_slot_size_label", None) or item.size,
                    sku=item.prodigi_sku,
                    country_code=order.shipping_country_code,
                    attributes=item.prodigi_attributes or {},
                )
                if order_asset is None:
                    log.error(
                        "Could not prepare order print asset for artwork %s category %s size %s.",
                        item.artwork_id,
                        category_id,
                        item.size,
                    )
                    item.prodigi_status = "Failed - Missing Order Asset"
                    continue

                asset_url = ProdigiOrderService._public_asset_url(order_asset.get("file_url"))
                if not asset_url:
                    log.error(
                        "Order print asset for artwork %s item %s has no usable file URL.",
                        item.artwork_id,
                        item.id,
                    )
                    item.prodigi_status = "Failed - Invalid Order Asset"
                    continue

                body = ProdigiOrderService.build_order_payload(
                    order=order,
                    item=item,
                    asset_url=asset_url,
                    print_area_name=order_asset.get("print_area_name") or "default",
                )

                # Send to Prodigi
                try:
                    response = await client.post("/orders", body)
                    # Prodigi response shape: {'outcome': 'Created', 'order': {'id': 'ord_123...'}}
                    if response.get("outcome") == "Created":
                        ord_id = response.get("order", {}).get("id")
                        item.prodigi_order_id = ord_id
                        item.prodigi_status = "Submitted"
                        log.info(f"Successfully submitted to Prodigi. Order ID: {ord_id}")
                    else:
                        log.error(f"Failed to submit to Prodigi. Response: {response}")
                        item.prodigi_status = "Failed - API Error"
                except Exception as e:
                    log.error(f"Exception submitting to Prodigi: {e}")
                    item.prodigi_status = "Failed - Execution Error"

        await db_session.commit()

    @staticmethod
    def build_order_payload(
        *,
        order: OrdersOrm,
        item: Any,
        asset_url: str,
        print_area_name: str = "default",
        merchant_reference: str | None = None,
        idempotency_key: str | None = None,
        callback_url: str | None = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {
            "shippingMethod": item.prodigi_shipping_method or "Standard",
            "merchantReference": merchant_reference or f"artshop-{order.id}-{item.id}",
            "idempotencyKey": idempotency_key or f"artshop-{order.id}-{item.id}-{uuid4()}",
            "recipient": {
                "name": f"{order.first_name} {order.last_name}",
                "address": {
                    "line1": order.shipping_address_line1 or "",
                    "line2": order.shipping_address_line2 or "",
                    "postalOrZipCode": order.shipping_postal_code or "",
                    "countryCode": order.shipping_country_code or "US",
                    "townOrCity": order.shipping_city or "",
                    "stateOrCounty": order.shipping_state or "",
                },
            },
            "items": [
                {
                    "sku": item.prodigi_sku,
                    "copies": 1,
                    "sizing": "fillPrintArea",
                    "attributes": item.prodigi_attributes or {},
                    "assets": [
                        {
                            "printArea": print_area_name or "default",
                            "url": asset_url,
                        }
                    ],
                }
            ],
        }

        if callback_url:
            body["callbackUrl"] = callback_url
        if order.shipping_phone or order.phone:
            body["recipient"]["phoneNumber"] = order.shipping_phone or order.phone
        if order.email:
            body["recipient"]["email"] = order.email
        return body

    @staticmethod
    def _resolve_category_id(item: Any) -> str | None:
        explicit = str(getattr(item, "prodigi_category_id", "") or "").strip()
        if explicit:
            return explicit

        finish = str(getattr(item, "finish", "") or "").lower()
        edition_type = str(getattr(item, "edition_type", "") or "").lower()

        if edition_type.startswith("paper_"):
            return "paperPrintBoxFramed" if "frame" in finish else "paperPrintRolled"

        if edition_type.startswith("canvas_"):
            if "floating" in finish:
                return "canvasFloatingFrame"
            if "classic" in finish:
                return "canvasClassicFrame"
            if "rolled" in finish:
                return "canvasRolled"
            return "canvasStretched"

        return None

    @staticmethod
    def _public_asset_url(file_url: str | None) -> str | None:
        if not file_url:
            return None
        if file_url.startswith("http://") or file_url.startswith("https://"):
            return file_url
        if file_url.startswith("/"):
            return f"{settings.PUBLIC_BASE_URL}{file_url}"
        return file_url
