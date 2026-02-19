# src/tasks/tasks.py
from PIL import Image
from pathlib import Path
import asyncio
from sqlalchemy import update
from loguru import logger

from src.tasks.celery_app import celery_instance
from src.models.collections import CollectionsOrm
from src.utils.db_manager import DBManager
from src.database import new_session_null_pool


def run_async(coro):
    """Safely run async code in sync Celery task"""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery_instance.task
def process_collection_image(collection_id: int, temp_file_path: str):
    logger.info("Processing image for collection_id={}", collection_id)
    file_path = Path(temp_file_path)
    output_dir = Path("static/images")
    output_dir.mkdir(parents=True, exist_ok=True)

    try:
        with Image.open(file_path) as img:
            original_name = f"{collection_id}_original.webp"
            img.save(output_dir / original_name, format="WEBP")

            img.thumbnail((400, 400))
            thumb_name = f"{collection_id}_thumb.webp"
            img.save(output_dir / thumb_name, format="WEBP")

        async def update_db():
            async with new_session_null_pool() as session:
                stmt = (
                    update(CollectionsOrm)
                    .where(CollectionsOrm.id == collection_id)
                    .values(
                        images=[
                            f"/static/images/{original_name}",
                            f"/static/images/{thumb_name}",
                        ]
                    )
                )
                await session.execute(stmt)
                await session.commit()

        run_async(update_db())
        logger.info(
            "Image processed for collection_id={}: original={}, thumb={}",
            collection_id,
            original_name,
            thumb_name,
        )

    except Exception as e:
        logger.error("Failed to process image for collection_id={}: {}", collection_id, e)
        raise

    finally:
        file_path.unlink(missing_ok=True)


async def send_emails_to_users_with_today_checkin_helper():
    logger.info("Checking orders with today's check-in")
    async with DBManager(session_factory=new_session_null_pool) as db:
        orders = await db.orders.get_orders_with_today_checkin()
        logger.info("Found {} orders with today's check-in", len(orders))


@celery_instance.task(name="order_today_checkin")
def send_emails_to_users_with_today_checkin():
    logger.info("Task started: order_today_checkin")
    try:
        run_async(send_emails_to_users_with_today_checkin_helper())
    except Exception as e:
        logger.error("Task failed: order_today_checkin: {}", e)
        return
    logger.info("Task finished: order_today_checkin")
