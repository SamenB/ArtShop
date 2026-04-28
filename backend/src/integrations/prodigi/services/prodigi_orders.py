import logging
from typing import Any
from urllib.parse import urlencode

from sqlalchemy import select

from src.config import settings
from src.integrations.prodigi.connectors.client import ProdigiClient
from src.integrations.prodigi.services.prodigi_attributes import normalize_prodigi_attributes
from src.integrations.prodigi.services.prodigi_fulfillment_quality import (
    PreparedProdigiItem,
    ProdigiFulfillmentQualityService,
    stable_payload_hash,
)
from src.models.orders import OrdersOrm
from src.models.prodigi_fulfillment import ProdigiFulfillmentJobOrm

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

        quality = ProdigiFulfillmentQualityService(db_session)
        job = await ProdigiOrderService._create_or_get_job(order, print_items, db_session)
        job_id = getattr(job, "id", None)

        prepared_items: list[PreparedProdigiItem] = []
        for item in print_items:
            log.info("Running Prodigi fulfillment gates for Order #%s Item #%s.", order.id, item.id)
            prepared = await quality.prepare_item(order=order, item=item, job_id=job_id)
            if prepared is None:
                item.prodigi_status = "Failed - Quality Gate"
                quality.add_event(
                    event_type="quality_gate",
                    stage="preflight",
                    status="failed",
                    order=order,
                    item=item,
                    job_id=job_id,
                    metadata={"reason": "One or more fulfillment quality gates failed."},
                )
                continue
            prepared_items.append(prepared)

        if not prepared_items:
            if job is not None:
                job.status = "blocked"
                job.last_error = "No print items passed Prodigi fulfillment quality gates."
            await db_session.commit()
            return

        body = ProdigiOrderService.build_batch_order_payload(
            order=order,
            prepared_items=prepared_items,
            merchant_reference=ProdigiOrderService._merchant_reference(order),
            idempotency_key=ProdigiOrderService._idempotency_key(order),
            callback_url=ProdigiOrderService._callback_url(),
        )

        if job is not None:
            job.status = "submitting"
            job.attempt_count = int(getattr(job, "attempt_count", 0) or 0) + 1
            job.payload_hash = stable_payload_hash(body)

        quality.add_event(
            event_type="api_request",
            stage="submit_order",
            status="started",
            order=order,
            job_id=job_id,
            request_payload=body,
            metadata=quality.build_gate_summary(prepared_items),
        )

        async with ProdigiClient(sandbox=settings.PRODIGI_SANDBOX) as client:
            try:
                response = await client.post("/orders", body)
                if response.get("outcome") == "Created":
                    ord_id = response.get("order", {}).get("id")
                    for prepared in prepared_items:
                        prepared.item.prodigi_order_id = ord_id
                        prepared.item.prodigi_status = "Submitted"
                    if job is not None:
                        job.prodigi_order_id = ord_id
                        job.status = "submitted"
                    quality.add_event(
                        event_type="api_response",
                        stage="submit_order",
                        status="passed",
                        order=order,
                        job_id=job_id,
                        external_id=ord_id,
                        request_payload=body,
                        response_payload=response,
                    )
                    log.info(
                        "Successfully submitted Order #%s to Prodigi. Prodigi ID: %s",
                        order.id,
                        ord_id,
                    )
                else:
                    for prepared in prepared_items:
                        prepared.item.prodigi_status = "Failed - API Error"
                    if job is not None:
                        job.status = "failed"
                        job.last_error = f"Unexpected Prodigi response: {response}"
                    quality.add_event(
                        event_type="api_response",
                        stage="submit_order",
                        status="failed",
                        order=order,
                        job_id=job_id,
                        request_payload=body,
                        response_payload=response,
                        error="Unexpected Prodigi response outcome.",
                    )
            except Exception as e:
                response = getattr(e, "response", None)
                for prepared in prepared_items:
                    prepared.item.prodigi_status = "Failed - Execution Error"
                if job is not None:
                    job.status = "failed"
                    job.last_error = str(e)
                quality.add_event(
                    event_type="api_response",
                    stage="submit_order",
                    status="failed",
                    order=order,
                    job_id=job_id,
                    request_payload=body,
                    response_payload=response.json() if response is not None else None,
                    error=str(e),
                )
                log.error("Exception submitting Order #%s to Prodigi: %s", order.id, e)

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
            "idempotencyKey": idempotency_key or f"artshop-order-{order.id}-item-{item.id}-v1",
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
                    "attributes": normalize_prodigi_attributes(item.prodigi_attributes),
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
    def build_batch_order_payload(
        *,
        order: OrdersOrm,
        prepared_items: list[PreparedProdigiItem],
        merchant_reference: str | None = None,
        idempotency_key: str | None = None,
        callback_url: str | None = None,
    ) -> dict[str, Any]:
        first_item = prepared_items[0].item
        body = ProdigiOrderService.build_order_payload(
            order=order,
            item=first_item,
            asset_url=prepared_items[0].asset_url,
            print_area_name=prepared_items[0].rendered.get("print_area_name") or "default",
            merchant_reference=merchant_reference or ProdigiOrderService._merchant_reference(order),
            idempotency_key=idempotency_key or ProdigiOrderService._idempotency_key(order),
            callback_url=callback_url,
        )
        body["items"] = [
            {
                "sku": prepared.item.prodigi_sku,
                "copies": 1,
                "sizing": "fillPrintArea",
                "attributes": normalize_prodigi_attributes(prepared.item.prodigi_attributes),
                "assets": [
                    {
                        "printArea": prepared.rendered.get("print_area_name") or "default",
                        "url": prepared.asset_url,
                    }
                ],
            }
            for prepared in prepared_items
        ]
        return body

    @staticmethod
    async def _create_or_get_job(
        order: OrdersOrm, print_items: list[Any], db_session
    ) -> Any | None:
        if not hasattr(db_session, "add"):
            return None

        idempotency_key = ProdigiOrderService._idempotency_key(order)
        if hasattr(db_session, "execute"):
            result = await db_session.execute(
                select(ProdigiFulfillmentJobOrm)
                .where(ProdigiFulfillmentJobOrm.idempotency_key == idempotency_key)
                .limit(1)
            )
            existing = result.scalar_one_or_none()
            if existing is not None:
                existing.status = "preflight"
                existing.item_ids = [int(item.id) for item in print_items]
                return existing

        job = ProdigiFulfillmentJobOrm(
            order_id=int(order.id),
            provider_key="prodigi",
            status="preflight",
            mode="sandbox" if settings.PRODIGI_SANDBOX else "live",
            merchant_reference=ProdigiOrderService._merchant_reference(order),
            idempotency_key=idempotency_key,
            item_ids=[int(item.id) for item in print_items],
        )
        db_session.add(job)
        if hasattr(db_session, "flush"):
            await db_session.flush()
        return job

    @staticmethod
    def _merchant_reference(order: OrdersOrm) -> str:
        return f"artshop-order-{order.id}"

    @staticmethod
    def _idempotency_key(order: OrdersOrm) -> str:
        return f"artshop-order-{order.id}-fulfillment-v1"

    @staticmethod
    def _callback_url() -> str | None:
        if not settings.PUBLIC_BASE_URL:
            return None
        base = f"{settings.PUBLIC_BASE_URL}/api/v1/webhooks/prodigi"
        if not settings.PRODIGI_WEBHOOK_SECRET:
            return base
        return f"{base}?{urlencode({'token': settings.PRODIGI_WEBHOOK_SECRET})}"

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
