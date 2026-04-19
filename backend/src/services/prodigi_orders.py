import logging
from src.config import settings
from src.connectors.prodigi import ProdigiClient
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
                
                # Fetch high-res artwork URL
                artwork = item.artwork
                if not artwork.print_quality_url:
                    log.error(f"Artwork {artwork.id} is missing print-quality image URL. Cannot submit to Prodigi.")
                    item.prodigi_status = "Failed - Missing Image Asset"
                    continue
                
                body = {
                    "shippingMethod": item.prodigi_shipping_method or "Standard",
                    "recipient": {
                        "name": f"{order.first_name} {order.last_name}",
                        "address": {
                            "line1": order.shipping_address_line1 or "",
                            "line2": order.shipping_address_line2 or "",
                            "postalOrZipCode": order.shipping_postal_code or "",
                            "countryCode": order.shipping_country_code or "US",
                            "townOrCity": order.shipping_city or "",
                            "stateOrCounty": order.shipping_state or "",
                        }
                    },
                    "items": [
                        {
                            "sku": item.prodigi_sku,
                            "copies": 1,
                            "sizing": "fillPrintArea",
                            "attributes": item.prodigi_attributes or {},
                            "assets": [
                                {
                                    "printArea": "default",
                                    "url": f"{settings.PUBLIC_BASE_URL}{artwork.print_quality_url}" if (artwork.print_quality_url and artwork.print_quality_url.startswith("/")) else artwork.print_quality_url
                                }
                            ]
                        }
                    ]
                }
                
                # Add phone/email if present
                if order.shipping_phone or order.phone:
                     body["recipient"]["phoneNumber"] = order.shipping_phone or order.phone
                if order.email:
                     body["recipient"]["email"] = order.email
                
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
                        item.prodigi_status = f"Failed - API Error"
                except Exception as e:
                    log.error(f"Exception submitting to Prodigi: {e}")
                    item.prodigi_status = "Failed - Execution Error"

        await db_session.commit()
