from __future__ import annotations

import asyncio

from src.database import new_session_null_pool
from src.integrations.prodigi.services.prodigi_fulfillment_retry import (
    ProdigiFulfillmentRetryService,
)
from src.tasks.celery_app import celery_instance


@celery_instance.task(name="retry_prodigi_fulfillment_jobs")
def retry_prodigi_fulfillment_jobs(limit: int = 20) -> dict:
    async def _run() -> dict:
        async with new_session_null_pool() as session:
            return await ProdigiFulfillmentRetryService(session).retry_pending(limit=limit)

    return asyncio.run(_run())
