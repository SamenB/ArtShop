import asyncio
import logging

from src.integrations.prodigi.services.prodigi_catalog import (
    CANVAS_SKU_PREFIXES,
    FRAMED_PAPER_PREFIXES,
    PAPER_SKU_PREFIXES,
    ProdigiCatalogService,
)
from src.tasks.celery_app import celery_instance

log = logging.getLogger(__name__)

catalog_service = ProdigiCatalogService()

@celery_instance.task(name="warmup_prodigi_catalog")
def warmup_prodigi_catalog():
    """Pre-populate Redis cache for top countries."""
    priority_countries = ["DE", "GB", "US", "UA", "FR", "PL", "NL", "AT", "CH"]
    log.info("Starting Prodigi catalog warmup task")

    # Run async logic in synchronous celery task
    loop = asyncio.get_event_loop()
    if loop.is_closed():
         loop = asyncio.new_event_loop()
         asyncio.set_event_loop(loop)

    async def run_warmup():
        for country in priority_countries:
            for prefix in PAPER_SKU_PREFIXES + CANVAS_SKU_PREFIXES + FRAMED_PAPER_PREFIXES:
                try:
                    await catalog_service.refresh_family_cache(country, prefix)
                except Exception as e:
                    log.error(f"Error refreshing {prefix} for {country}: {e}")

    loop.run_until_complete(run_warmup())
    log.info("Finished Prodigi catalog warmup task")
