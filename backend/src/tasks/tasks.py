"""
Asynchronous background tasks for the ArtShop application.
Includes image processing (optimization, resizing, and WebP conversion) 
and scheduled maintenance tasks like email notifications.
"""
import asyncio
import time
from pathlib import Path

from loguru import logger
from PIL import Image
from sqlalchemy import update, select

from src.database import new_session_null_pool
from src.models.artworks import ArtworksOrm
from src.tasks.celery_app import celery_instance
from src.utils.db_manager import DBManager


def run_async(coro):
    """
    Safely executes an asynchronous coroutine within a synchronous Celery task.
    Manages a new event loop for the duration of the execution.
    """
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery_instance.task
def process_and_attach_image(model_type: str, model_id: int, temp_paths: list[str]):
    """
    Optimizes and generates multiple versions of uploaded images.
    
    Logic:
    1. Creates target directories if missing.
    2. Converts images to WebP format with different resolutions (original, medium, thumb).
    3. Handles transparency and color modes.
    4. Saves optimized files with globally unique names to prevent collisions.
    5. Updates the database record with the new image URL metadata.
    6. Cleans up temporary upload files.
    """
    logger.info("Processing images for {} id={}", model_type, model_id)
    output_dir = Path("static/images")
    output_dir.mkdir(parents=True, exist_ok=True)

    final_paths = []
    upload_ts = int(time.time())

    try:
        for idx, temp_file_path in enumerate(temp_paths):
            file_path = Path(temp_file_path)
            if not file_path.exists():
                continue

            with Image.open(file_path) as img:
                # Standardize to RGB for WebP compatibility, handling transparency.
                if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
                    alpha = img.convert("RGBA").split()[-1]
                    bg = Image.new("RGBA", img.size, (255, 255, 255, 255))
                    bg.paste(img, mask=alpha)
                    img = bg.convert("RGB")
                elif img.mode != "RGB":
                    img = img.convert("RGB")

                # Generate unique filename prefix using model ID and timestamp.
                prefix = f"{model_type}_{model_id}_{upload_ts}_{idx}"

                # 1. Store Original (High Quality preservation)
                original_name = f"{prefix}_original.webp"
                img.save(output_dir / original_name, format="WEBP", quality=92)

                # 2. Store Medium (Optimized for standard viewing, max 1200px)
                medium_img = img.copy()
                medium_img.thumbnail((1200, 1200))
                medium_name = f"{prefix}_medium.webp"
                medium_img.save(output_dir / medium_name, format="WEBP", quality=82)

                # 3. Store Thumb (Optimized for grids/lists, max 400px)
                thumb_img = img.copy()
                thumb_img.thumbnail((400, 400))
                thumb_name = f"{prefix}_thumb.webp"
                thumb_img.save(output_dir / thumb_name, format="WEBP", quality=75)

                final_paths.append(
                    {
                        "original": f"/static/images/{original_name}",
                        "medium": f"/static/images/{medium_name}",
                        "thumb": f"/static/images/{thumb_name}",
                    }
                )

            # Delete the temporary uploaded file to free space.
            file_path.unlink(missing_ok=True)

        async def update_db(the_final_paths: list):
            """Internal helper to atomically append image details to the DB record."""
            async with new_session_null_pool() as session:
                orm_model = ArtworksOrm
                # Retrieve current image list to append new items.
                result = await session.execute(
                    select(orm_model.images).where(orm_model.id == model_id)
                )
                row = result.scalar_one_or_none()
                existing_images = list(row) if row else []
                merged_images = existing_images + the_final_paths
                
                # Update the model with the merged JSON array.
                stmt = (
                    update(orm_model).where(orm_model.id == model_id).values(images=merged_images)
                )
                await session.execute(stmt)
                await session.commit()

        if final_paths:
            run_async(update_db(final_paths))

        logger.info(
            "Images processed for {} id={}: paths={}",
            model_type,
            model_id,
            final_paths,
        )

    except Exception as e:
        logger.error("Failed to process images for {} id={}: {}", model_type, model_id, e)
        raise


async def send_emails_to_users_with_today_checkin_helper():
    """
    Core logic for processing daily check-ins.
    Identifies relevant orders and logs the batch size.
    """
    logger.info("Checking orders with today's check-in")
    async with DBManager(session_factory=new_session_null_pool) as db:
        orders = await db.orders.get_orders_with_today_checkin()
        logger.info("Found {} orders with today's check-in", len(orders))


@celery_instance.task(name="order_today_checkin")
def send_emails_to_users_with_today_checkin():
    """
    Periodic task triggered by Celery Beat for routine order monitoring.
    """
    logger.info("Task started: order_today_checkin")
    try:
        run_async(send_emails_to_users_with_today_checkin_helper())
    except Exception as e:
        logger.error("Task failed: order_today_checkin: {}", e)
        return
    logger.info("Task finished: order_today_checkin")
