from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import selectinload

from src.config import settings
from src.integrations.prodigi.connectors.client import ProdigiClient
from src.integrations.prodigi.fulfillment.contract import (
    ProdigiPayloadValidationError,
    build_order_payload,
    callback_url,
    canonical_shipping_method,
    public_asset_url,
    stable_payload_hash,
)
from src.integrations.prodigi.fulfillment.gates import BLOCKED, FAILED, PASSED, PENDING
from src.integrations.prodigi.fulfillment.status import (
    SUCCESS_OUTCOMES,
    apply_order_status_to_job,
    apply_prodigi_items_to_local_items,
    persist_shipments,
)
from src.integrations.prodigi.services.prodigi_fulfillment_quality import (
    FulfillmentGateResult,
    PreparedProdigiItem,
    ProdigiFulfillmentQualityService,
)
from src.models.orders import OrdersOrm
from src.models.prodigi_fulfillment import (
    ProdigiFulfillmentEventOrm,
    ProdigiFulfillmentGateResultOrm,
    ProdigiFulfillmentJobOrm,
)

log = logging.getLogger(__name__)

SUBMITTED_OR_TERMINAL_STATUSES = {
    "submitted",
    "submitting",
    "in_progress",
    "on_hold",
    "issue",
    "complete",
    "cancelled",
}

SUBMITTED_STATUSES = {
    "submitted",
    "in_progress",
    "on_hold",
    "issue",
    "complete",
    "cancelled",
}


@dataclass(slots=True)
class ProdigiPreflightResult:
    job: ProdigiFulfillmentJobOrm | None
    prepared_items: list[PreparedProdigiItem]
    passed: bool
    request_payload: dict[str, Any] | None = None


class ProdigiFulfillmentWorkflow:
    def __init__(self, db_session: Any):
        self.db_session = db_session
        self.quality = ProdigiFulfillmentQualityService(db_session)

    async def run_preflight(
        self,
        order: Any,
        *,
        commit: bool = True,
        clear_previous: bool = True,
    ) -> ProdigiPreflightResult:
        order_orm = await self._load_order(order.id)
        if order_orm is None:
            return ProdigiPreflightResult(job=None, prepared_items=[], passed=False)
        order = order_orm
        print_items = [item for item in order.items if item.prodigi_sku]
        if not print_items:
            log.info("No print-on-demand items found for order #%s.", order.id)
            job = await self._create_or_get_job(order, print_items)
            await self._persist_order_preflight_gates(order, print_items, job)
            if job is not None:
                job.status = "blocked"
                job.last_error = "No Prodigi-backed print items were found for this order."
            if commit:
                await self.db_session.commit()
            return ProdigiPreflightResult(job=job, prepared_items=[], passed=False)

        job = await self._create_or_get_job(order, print_items)
        job_id = getattr(job, "id", None)
        if clear_previous and job_id is not None:
            await self._clear_preflight_results(order_id=int(order.id), job_id=int(job_id))
        order_gates_green = await self._persist_order_preflight_gates(order, print_items, job)
        if not order_gates_green:
            if job is not None:
                job.status = "blocked"
                job.last_error = "One or more order-level Prodigi preflight gates failed."
            if commit:
                await self.db_session.commit()
            return ProdigiPreflightResult(job=job, prepared_items=[], passed=False)

        prepared_items = await self._prepare_items(order, print_items, job_id)
        if len(prepared_items) != len(print_items):
            if job is not None:
                job.status = "blocked"
                job.last_error = "No print items passed Prodigi fulfillment quality gates."
                job.request_payload = None
                job.payload_hash = None
            await self.quality.persist_order_gate(
                order=order,
                job_id=job_id,
                gate=FulfillmentGateResult(
                    gate="payload_valid",
                    status=BLOCKED,
                    measured={
                        "prepared_item_count": len(prepared_items),
                        "expected_item_count": len(print_items),
                        "blocking_gates": [
                            "public_asset_url_ready",
                            "asset_rendered",
                            "rendered_asset_pixel_match",
                            "rendered_asset_md5_ready",
                            "prodigi_quote_check",
                            "live_prodigi_pixel_contract_verified",
                            "storefront_rehydrated",
                        ],
                    },
                    expected={"prodigi_order_payload": "valid", "items": len(print_items)},
                    error=(
                        "Payload was not built because one or more required upstream "
                        "Prodigi preflight gates failed."
                    ),
                ),
            )
            if commit:
                await self.db_session.commit()
            return ProdigiPreflightResult(job=job, prepared_items=prepared_items, passed=False)

        mode = "sandbox" if settings.PRODIGI_SANDBOX else "live"
        try:
            body = build_order_payload(
                order=order,
                prepared_items=prepared_items,
                job_id=job_id,
                merchant_reference=self.merchant_reference(order),
                idempotency_key=self.idempotency_key(order, job),
                callback_url=callback_url(),
                mode=mode,
            )
        except ProdigiPayloadValidationError as exc:
            if job is not None:
                job.status = "blocked"
                job.last_error = str(exc)
                job.request_payload = None
                job.payload_hash = None
            await self.quality.persist_order_gate(
                order=order,
                job_id=job_id,
                gate=FulfillmentGateResult(
                    gate="payload_valid",
                    status=FAILED,
                    measured={"errors": exc.errors},
                    expected={"prodigi_order_payload": "valid"},
                    error=str(exc),
                ),
            )
            if commit:
                await self.db_session.commit()
            return ProdigiPreflightResult(job=job, prepared_items=prepared_items, passed=False)

        if job is not None:
            job.status = "preflight_passed"
            job.mode = mode
            job.last_error = None
            job.request_payload = body
            job.payload_hash = stable_payload_hash(body)
            job.idempotency_key = self.idempotency_key(order, job)

        await self.quality.persist_order_gate(
            order=order,
            job_id=job_id,
            gate=FulfillmentGateResult(
                gate="payload_valid",
                status=PASSED,
                measured={
                    "payload_hash": stable_payload_hash(body),
                    "merchant_reference": body.get("merchantReference"),
                    "idempotency_key": body.get("idempotencyKey"),
                    "item_count": len(body.get("items") or []),
                    "has_callback_url": bool(body.get("callbackUrl")),
                },
                expected={"prodigi_order_payload": "valid", "items": len(print_items)},
            ),
        )
        self.quality.add_event(
            event_type="preflight",
            stage="payload_preview",
            status="passed",
            order=order,
            job_id=job_id,
            request_payload=body,
            metadata=self.quality.build_gate_summary(prepared_items),
        )
        if commit:
            await self.db_session.commit()
        return ProdigiPreflightResult(
            job=job,
            prepared_items=prepared_items,
            passed=True,
            request_payload=body,
        )

    async def submit_paid_order(self, order: OrdersOrm) -> None:
        await self.submit_ready_order(order)

    async def submit_ready_order(self, order: Any) -> None:
        order_orm = await self._load_order(order.id)
        if order_orm is None:
            return
        order = order_orm
        existing_job = await self._latest_job_for_order(order)
        if (
            existing_job is not None
            and existing_job.status in SUBMITTED_STATUSES
            and existing_job.prodigi_order_id
        ):
            await self.poll_status(existing_job, order=order)
            return

        preflight = await self.run_preflight(order, commit=False, clear_previous=True)
        job = preflight.job
        job_id = getattr(job, "id", None)
        body = job.request_payload if job is not None else preflight.request_payload
        if not preflight.passed or not body:
            if job is not None:
                job.status = "blocked"
                job.last_error = job.last_error or "Prodigi preflight is not green."
            await self.db_session.commit()
            return

        if job is not None:
            job.status = "submitting"
            job.attempt_count = int(getattr(job, "attempt_count", 0) or 0) + 1

        self.quality.add_event(
            event_type="api_request",
            stage="submit_order",
            status="started",
            order=order,
            job_id=job_id,
            request_payload=body,
            metadata=self.quality.build_gate_summary(preflight.prepared_items),
        )
        await self._submit_to_prodigi(
            order=order,
            job=job,
            prepared_items=preflight.prepared_items,
            body=body,
        )
        await self.db_session.commit()

    async def poll_status(
        self,
        job: ProdigiFulfillmentJobOrm,
        *,
        order: OrdersOrm | None = None,
    ) -> dict[str, Any] | None:
        if not job.prodigi_order_id:
            return None
        order = order or await self._load_order(int(job.order_id))
        async with ProdigiClient(sandbox=settings.PRODIGI_SANDBOX) as client:
            try:
                payload = await client.get_order(str(job.prodigi_order_id))
            except Exception as exc:
                self.quality.add_event(
                    event_type="api_response",
                    stage="status_poll",
                    status="failed",
                    order=order,
                    job_id=job.id,
                    external_id=str(job.prodigi_order_id),
                    error=str(exc),
                )
                await self.db_session.commit()
                raise
        if not isinstance(payload, dict):
            return None
        order_data = payload.get("order") if isinstance(payload.get("order"), dict) else payload
        apply_order_status_to_job(job=job, order_data=order_data, response_payload=payload)
        if order is not None:
            apply_prodigi_items_to_local_items(order, order_data)
            await persist_shipments(
                db_session=self.db_session,
                job=job,
                order=order,
                order_data=order_data,
            )
        self.quality.add_event(
            event_type="api_response",
            stage="status_poll",
            status="passed",
            order=order,
            job_id=job.id,
            external_id=str(job.prodigi_order_id),
            response_payload=payload,
            metadata={
                "status_stage": job.status_stage,
                "issues": job.issues,
            },
        )
        await self.db_session.commit()
        return payload

    async def _prepare_items(
        self,
        order: OrdersOrm,
        print_items: list[Any],
        job_id: int | None,
    ) -> list[PreparedProdigiItem]:
        prepared_items: list[PreparedProdigiItem] = []
        for item in print_items:
            log.info("Running Prodigi fulfillment gates for Order #%s Item #%s.", order.id, item.id)
            prepared = await self.quality.prepare_item(order=order, item=item, job_id=job_id)
            if prepared is None:
                item.prodigi_status = "Failed - Quality Gate"
                self.quality.add_event(
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
        return prepared_items

    async def _submit_to_prodigi(
        self,
        *,
        order: OrdersOrm,
        job: ProdigiFulfillmentJobOrm | None,
        prepared_items: list[PreparedProdigiItem],
        body: dict[str, Any],
    ) -> None:
        job_id = getattr(job, "id", None)
        async with ProdigiClient(sandbox=settings.PRODIGI_SANDBOX) as client:
            try:
                response = await client.post("/orders", body)
                outcome = str(response.get("outcome") or "")
                order_data = (
                    response.get("order") if isinstance(response.get("order"), dict) else {}
                )
                prodigi_order_id = order_data.get("id")
                if outcome.replace(" ", "").lower() in SUCCESS_OUTCOMES and prodigi_order_id:
                    fetched = await client.get_order(str(prodigi_order_id))
                    status_payload = fetched if isinstance(fetched, dict) else response
                    status_order = (
                        status_payload.get("order")
                        if isinstance(status_payload.get("order"), dict)
                        else order_data
                    )
                    self._mark_submitted(
                        order=order,
                        job=job,
                        prepared_items=prepared_items,
                        response=response,
                        status_order=status_order,
                        outcome=outcome,
                    )
                    await persist_shipments(
                        db_session=self.db_session,
                        job=job,
                        order=order,
                        order_data=status_order,
                    )
                    self.quality.add_event(
                        event_type="api_response",
                        stage="submit_order",
                        status="passed",
                        order=order,
                        job_id=job_id,
                        external_id=str(prodigi_order_id),
                        request_payload=body,
                        response_payload=response,
                        metadata={"status_poll": status_payload},
                    )
                    return

                self._mark_api_failure(
                    order=order,
                    job=job,
                    prepared_items=prepared_items,
                    error=f"Unexpected Prodigi response outcome: {response}",
                )
                self.quality.add_event(
                    event_type="api_response",
                    stage="submit_order",
                    status="failed",
                    order=order,
                    job_id=job_id,
                    request_payload=body,
                    response_payload=response,
                    error="Unexpected Prodigi response outcome.",
                )
            except Exception as exc:
                response = getattr(exc, "response", None)
                try:
                    response_payload = response.json() if response is not None else None
                except Exception:
                    response_payload = None
                self._mark_api_failure(
                    order=order,
                    job=job,
                    prepared_items=prepared_items,
                    error=str(exc),
                    response_payload=response_payload,
                )
                self.quality.add_event(
                    event_type="api_response",
                    stage="submit_order",
                    status="failed",
                    order=order,
                    job_id=job_id,
                    request_payload=body,
                    response_payload=response_payload,
                    error=str(exc),
                )
                log.error(
                    "Exception submitting Order #%s to Prodigi: %s\norder type=%s, items types=%s",
                    order.id,
                    exc,
                    type(order).__name__,
                    [type(i).__name__ for i in (getattr(order, "items", None) or [])],
                    exc_info=True,
                )

    def _mark_submitted(
        self,
        *,
        order: OrdersOrm,
        job: ProdigiFulfillmentJobOrm | None,
        prepared_items: list[PreparedProdigiItem],
        response: dict[str, Any],
        status_order: dict[str, Any],
        outcome: str,
    ) -> None:
        prodigi_order_id = status_order.get("id") or (response.get("order") or {}).get("id")
        for prepared in prepared_items:
            prepared.item.prodigi_order_id = prodigi_order_id
            prepared.item.prodigi_status = "Submitted"
        if getattr(order, "fulfillment_status", None) in {None, "pending", "confirmed"}:
            order.fulfillment_status = "print_ordered"
            order.print_ordered_at = getattr(order, "print_ordered_at", None) or datetime.now(
                timezone.utc
            ).replace(tzinfo=None)
        if job is not None:
            job.prodigi_order_id = str(prodigi_order_id)
            apply_order_status_to_job(
                job=job,
                order_data=status_order,
                response_payload=response,
                outcome=outcome,
            )
        apply_prodigi_items_to_local_items(order, status_order)
        log.info(
            "Successfully submitted Order #%s to Prodigi. Prodigi ID: %s",
            order.id,
            prodigi_order_id,
        )

    def _mark_api_failure(
        self,
        *,
        order: OrdersOrm,
        job: ProdigiFulfillmentJobOrm | None,
        prepared_items: list[PreparedProdigiItem],
        error: str,
        response_payload: dict[str, Any] | None = None,
    ) -> None:
        for prepared in prepared_items:
            prepared.item.prodigi_status = "Failed - API Error"
        if job is not None:
            job.status = "failed"
            job.last_error = error
            if response_payload is not None:
                job.response_payload = response_payload

    async def _latest_job_for_order(self, order: OrdersOrm) -> ProdigiFulfillmentJobOrm | None:
        if not hasattr(self.db_session, "execute"):
            return None
        result = await self.db_session.execute(
            select(ProdigiFulfillmentJobOrm)
            .where(ProdigiFulfillmentJobOrm.order_id == int(order.id))
            .order_by(ProdigiFulfillmentJobOrm.id.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def _load_order(self, order_id: int) -> OrdersOrm | None:
        if not hasattr(self.db_session, "execute"):
            return None
        result = await self.db_session.execute(
            select(OrdersOrm)
            .where(OrdersOrm.id == order_id)
            .options(selectinload(OrdersOrm.items))
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def _create_or_get_job(
        self,
        order: OrdersOrm,
        print_items: list[Any],
    ) -> ProdigiFulfillmentJobOrm | None:
        if not hasattr(self.db_session, "add"):
            return None

        merchant_reference = self.merchant_reference(order)
        next_revision = 1
        if hasattr(self.db_session, "execute"):
            result = await self.db_session.execute(
                select(ProdigiFulfillmentJobOrm)
                .where(ProdigiFulfillmentJobOrm.merchant_reference == merchant_reference)
                .order_by(ProdigiFulfillmentJobOrm.id.desc())
                .limit(1)
            )
            existing = result.scalar_one_or_none()
            if existing is not None:
                if existing.status in SUBMITTED_OR_TERMINAL_STATUSES:
                    next_revision = int(getattr(existing, "submission_revision", None) or 1) + 1
                else:
                    existing.status = "preflight"
                    existing.item_ids = [int(item.id) for item in print_items]
                    existing.idempotency_key = self.idempotency_key(order, existing)
                    return existing

        revision = next_revision
        job = ProdigiFulfillmentJobOrm(
            order_id=int(order.id),
            provider_key="prodigi",
            status="preflight",
            mode="sandbox" if settings.PRODIGI_SANDBOX else "live",
            merchant_reference=merchant_reference,
            idempotency_key=f"{merchant_reference}-fulfillment-v{revision}",
            submission_revision=revision,
            item_ids=[int(item.id) for item in print_items],
        )
        self.db_session.add(job)
        if hasattr(self.db_session, "flush"):
            await self.db_session.flush()
        return job

    async def _clear_preflight_results(self, *, order_id: int, job_id: int) -> None:
        if not hasattr(self.db_session, "execute"):
            return
        await self.db_session.execute(
            delete(ProdigiFulfillmentGateResultOrm).where(
                ProdigiFulfillmentGateResultOrm.order_id == order_id,
                ProdigiFulfillmentGateResultOrm.job_id == job_id,
            )
        )
        await self.db_session.execute(
            delete(ProdigiFulfillmentEventOrm).where(
                ProdigiFulfillmentEventOrm.order_id == order_id,
                ProdigiFulfillmentEventOrm.job_id == job_id,
                ProdigiFulfillmentEventOrm.event_type.in_(["quality_gate", "preflight"]),
            )
        )

    async def _persist_order_preflight_gates(
        self,
        order: OrdersOrm,
        print_items: list[Any],
        job: ProdigiFulfillmentJobOrm | None,
    ) -> bool:
        job_id = getattr(job, "id", None)
        cost_summary = self._cost_summary(order, print_items)
        recipient_check = self._recipient_check(order)
        gates = [
            FulfillmentGateResult(
                gate="payment_confirmed",
                status=PASSED if order.payment_status in {"paid", "mock_paid"} else PENDING,
                measured={"payment_status": order.payment_status},
                expected={"payment_status": ["paid", "mock_paid"]},
                error=None
                if order.payment_status in {"paid", "mock_paid"}
                else "Order payment is not confirmed yet.",
            ),
            FulfillmentGateResult(
                gate="print_items_detected",
                status=PASSED if print_items else FAILED,
                measured={
                    "count": len(print_items),
                    "items": [
                        {
                            "id": item.id,
                            "sku": item.prodigi_sku,
                            "category": item.prodigi_category_id,
                        }
                        for item in print_items
                    ],
                },
                expected={"count": ">=1"},
                error=None if print_items else "No Prodigi-backed print items were detected.",
            ),
            FulfillmentGateResult(
                gate="cost_covered",
                status=PASSED if cost_summary["covered"] else FAILED,
                measured=cost_summary,
                expected={"customer_paid": ">= supplier_total"},
                error=None
                if cost_summary["covered"]
                else "Customer paid total is below the persisted Prodigi supplier total.",
            ),
            FulfillmentGateResult(
                gate="job_created",
                status=PASSED if job is not None else PENDING,
                measured={
                    "job_id": job_id,
                    "revision": getattr(job, "submission_revision", None),
                    "idempotency_key": getattr(job, "idempotency_key", None),
                    "mode": getattr(job, "mode", None),
                },
                expected={"job": "persisted"},
            ),
            FulfillmentGateResult(
                gate="recipient_ready",
                status=PASSED if recipient_check["passed"] else FAILED,
                measured=recipient_check["measured"],
                expected=recipient_check["expected"],
                error=recipient_check["error"],
            ),
        ]
        for gate in gates:
            await self.quality.persist_order_gate(order=order, job_id=job_id, gate=gate)
        return all(
            gate.status == PASSED or (gate.gate == "job_created" and job is None) for gate in gates
        )

    def _cost_summary(self, order: OrdersOrm, print_items: list[Any]) -> dict[str, Any]:
        supplier_total = 0.0
        for item in print_items:
            item_supplier_total = getattr(item, "prodigi_supplier_total_eur", None)
            if item_supplier_total is not None:
                supplier_total += float(item_supplier_total)
            else:
                supplier_total += float(getattr(item, "prodigi_wholesale_eur", None) or 0)
                supplier_total += float(getattr(item, "prodigi_shipping_eur", None) or 0)
        customer_paid = float(getattr(order, "total_price", None) or 0)
        return {
            "customer_paid": customer_paid,
            "customer_currency": "USD",
            "supplier_total": supplier_total,
            "supplier_currency": "EUR",
            "estimated_margin_before_fx": customer_paid - supplier_total,
            "covered": supplier_total <= customer_paid,
            "note": "Supplier costs are EUR; margin is before FX conversion and payment fees.",
        }

    def _recipient_check(self, order: OrdersOrm) -> dict[str, Any]:
        measured = {
            "name": f"{order.first_name} {order.last_name}".strip(),
            "email": order.email,
            "phone": order.shipping_phone or order.phone,
            "line1": order.shipping_address_line1,
            "line2": order.shipping_address_line2,
            "postal_or_zip_code": order.shipping_postal_code,
            "country_code": (order.shipping_country_code or "").upper(),
            "town_or_city": order.shipping_city,
            "state_or_county": order.shipping_state,
        }
        missing = [
            key
            for key in ("name", "line1", "postal_or_zip_code", "country_code", "town_or_city")
            if not measured.get(key)
        ]
        if measured.get("country_code") and len(str(measured["country_code"])) != 2:
            missing.append("country_code_iso2")
        return {
            "passed": not missing,
            "measured": measured,
            "expected": {
                "name": "present",
                "address.line1": "present",
                "address.postalOrZipCode": "present",
                "address.countryCode": "ISO2",
                "address.townOrCity": "present",
                "phoneNumber": "optional",
                "email": "optional",
            },
            "error": None
            if not missing
            else f"Recipient data is incomplete for Prodigi: {', '.join(missing)}.",
        }

    @staticmethod
    def merchant_reference(order: OrdersOrm) -> str:
        return f"artshop-order-{order.id}"

    @staticmethod
    def idempotency_key(order: OrdersOrm, job: ProdigiFulfillmentJobOrm | None = None) -> str:
        revision = int(getattr(job, "submission_revision", None) or 1)
        return f"artshop-order-{order.id}-fulfillment-v{revision}"

    @staticmethod
    def canonical_shipping_method(value: str | None) -> str:
        return canonical_shipping_method(value)

    @staticmethod
    def public_asset_url(file_url: str | None) -> str | None:
        return public_asset_url(file_url)
