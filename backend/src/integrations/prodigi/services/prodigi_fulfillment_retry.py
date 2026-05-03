from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from src.integrations.prodigi.services.prodigi_fulfillment_quality import (
    ProdigiFulfillmentQualityService,
)
from src.integrations.prodigi.services.prodigi_orders import ProdigiOrderService
from src.models.orders import OrdersOrm
from src.models.prodigi_fulfillment import ProdigiFulfillmentJobOrm

RETRYABLE_JOB_STATUSES = {"failed", "blocked", "submitting"}
TERMINAL_JOB_STATUSES = {"submitted", "cancelled"}


class ProdigiFulfillmentRetryService:
    def __init__(self, db_session):
        self.db_session = db_session
        self.quality = ProdigiFulfillmentQualityService(db_session)

    async def retry_job(self, job_id: int, *, force: bool = False) -> dict[str, Any]:
        job = await self._get_job(job_id)
        if job is None:
            return {"status": "not_found", "job_id": job_id}
        if job.status in TERMINAL_JOB_STATUSES and not force:
            return {
                "status": "skipped",
                "job_id": job.id,
                "reason": f"Job status {job.status} is terminal. Use force to override.",
            }
        if job.status not in RETRYABLE_JOB_STATUSES and not force:
            return {
                "status": "skipped",
                "job_id": job.id,
                "reason": f"Job status {job.status} is not retryable.",
            }

        order = await self._get_order(job.order_id)
        if order is None:
            job.status = "failed"
            job.last_error = "Order not found for retry."
            await self.db_session.commit()
            return {"status": "failed", "job_id": job.id, "reason": job.last_error}

        self.quality.add_event(
            event_type="retry",
            stage="retry_requested",
            status="started",
            order=order,
            job_id=job.id,
            metadata={"previous_status": job.status, "force": force},
        )
        job.status = "retrying"
        job.last_error = None
        await self.db_session.flush()
        await ProdigiOrderService.submit_order_items(order, self.db_session)
        return {"status": "submitted", "job_id": job.id, "order_id": order.id}

    async def retry_pending(self, *, limit: int = 20) -> dict[str, Any]:
        result = await self.db_session.execute(
            select(ProdigiFulfillmentJobOrm)
            .where(ProdigiFulfillmentJobOrm.status.in_(RETRYABLE_JOB_STATUSES))
            .order_by(ProdigiFulfillmentJobOrm.updated_at.asc())
            .limit(limit)
        )
        jobs = list(result.scalars().all())
        results = []
        for job in jobs:
            results.append(await self.retry_job(int(job.id)))
        return {
            "status": "processed",
            "requested_limit": limit,
            "job_count": len(jobs),
            "results": results,
        }

    async def _get_job(self, job_id: int) -> ProdigiFulfillmentJobOrm | None:
        result = await self.db_session.execute(
            select(ProdigiFulfillmentJobOrm).where(ProdigiFulfillmentJobOrm.id == job_id).limit(1)
        )
        return result.scalar_one_or_none()

    async def _get_order(self, order_id: int) -> OrdersOrm | None:
        result = await self.db_session.execute(
            select(OrdersOrm)
            .where(OrdersOrm.id == order_id)
            .options(selectinload(OrdersOrm.items))
            .limit(1)
        )
        return result.scalar_one_or_none()
