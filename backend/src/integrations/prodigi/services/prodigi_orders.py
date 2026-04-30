from __future__ import annotations

from types import SimpleNamespace
from typing import Any

from src.config import settings
from src.integrations.prodigi.fulfillment.contract import (
    build_order_payload as build_contract_order_payload,
)
from src.integrations.prodigi.fulfillment.contract import (
    callback_url,
    canonical_shipping_method,
    public_asset_url,
)
from src.integrations.prodigi.fulfillment.workflow import ProdigiFulfillmentWorkflow
from src.models.orders import OrdersOrm


class ProdigiOrderService:
    @staticmethod
    async def submit_order_items(order: OrdersOrm, db_session) -> None:
        """
        Submit paid Prodigi-backed print items through the centralized fulfillment workflow.

        Kept as the compatibility entrypoint for provider-neutral code.
        """
        await ProdigiFulfillmentWorkflow(db_session).submit_paid_order(order)

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
        prepared = SimpleNamespace(
            item=item,
            asset_url=asset_url,
            rendered={"print_area_name": print_area_name or "default"},
        )
        return build_contract_order_payload(
            order=order,
            prepared_items=[prepared],
            job_id=None,
            merchant_reference=merchant_reference or f"artshop-{order.id}-{item.id}",
            idempotency_key=idempotency_key or f"artshop-order-{order.id}-item-{item.id}-v1",
            callback_url=callback_url,
            mode="sandbox" if settings.PRODIGI_SANDBOX else "live",
        )

    @staticmethod
    def build_batch_order_payload(
        *,
        order: OrdersOrm,
        prepared_items: list[Any],
        merchant_reference: str | None = None,
        idempotency_key: str | None = None,
        callback_url: str | None = None,
    ) -> dict[str, Any]:
        return build_contract_order_payload(
            order=order,
            prepared_items=prepared_items,
            job_id=None,
            merchant_reference=merchant_reference or ProdigiOrderService._merchant_reference(order),
            idempotency_key=idempotency_key or ProdigiOrderService._idempotency_key(order),
            callback_url=callback_url,
            mode="sandbox" if settings.PRODIGI_SANDBOX else "live",
        )

    @staticmethod
    def _merchant_reference(order: OrdersOrm) -> str:
        return f"artshop-order-{order.id}"

    @staticmethod
    def _idempotency_key(order: OrdersOrm) -> str:
        return f"artshop-order-{order.id}-fulfillment-v1"

    @staticmethod
    def _callback_url() -> str | None:
        return callback_url()

    @staticmethod
    def _canonical_shipping_method(value: str | None) -> str:
        return canonical_shipping_method(value)

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
        return public_asset_url(file_url)
