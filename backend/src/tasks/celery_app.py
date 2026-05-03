"""
Asynchronous task queue configuration using Celery.
Defines the connection to the Redis broker, includes task modules,
and configures periodic tasks via Celery Beat.
"""

from celery import Celery

from src.config import settings
from src.logging_config import setup_logging

# Initialize logging for worker processes
setup_logging()

# Main Celery application instance
# Usage for worker: celery -A src.tasks.celery_app:celery_instance worker --loglevel=info --pool=solo
celery_instance = Celery(
    "art_shop_app",
    broker=settings.REDIS_URL,
    include=[
        "src.tasks.tasks",
        "src.integrations.prodigi.tasks.prodigi_retry_fulfillment",
    ],
)

# Configuration for periodic/scheduled tasks (Celery Beat)
# Usage for beat: celery -A src.tasks.celery_app:celery_instance beat --loglevel=info
celery_instance.conf.beat_schedule = {
    "release-abandoned-orders": {
        "task": "release_abandoned_orders",
        "schedule": 3600,  # Run every hour
    },
    "retry-prodigi-fulfillment": {
        "task": "retry_prodigi_fulfillment_jobs",
        "schedule": 900,  # Run every 15 minutes
        "args": (20,),
    },
}
