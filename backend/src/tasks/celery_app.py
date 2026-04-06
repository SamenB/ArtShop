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
    include=["src.tasks.tasks"],
)

# Configuration for periodic/scheduled tasks (Celery Beat)
# Usage for beat: celery -A src.tasks.celery_app:celery_instance beat --loglevel=info
celery_instance.conf.beat_schedule = {
    "send-emails-to-users-with-today-checkin": {
        "task": "order_today_checkin",
        "schedule": 5,  # Run every 5 seconds for demonstration/polling
    },
}
