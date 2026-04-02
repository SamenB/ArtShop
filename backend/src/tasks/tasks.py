# src/tasks/tasks.py
import asyncio
from pathlib import Path

from loguru import logger
from PIL import Image
from sqlalchemy import update

from src.database import new_session_null_pool
from src.models.artworks import ArtworksOrm
from src.tasks.celery_app import celery_instance
from src.utils.db_manager import DBManager


def run_async(coro):
    """Safely run async code in sync Celery task"""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery_instance.task
def process_and_attach_image(model_type: str, model_id: int, temp_paths: list[str]):
    logger.info("Processing images for {} id={}", model_type, model_id)
    output_dir = Path("static/images")
    output_dir.mkdir(parents=True, exist_ok=True)

    final_paths = []
    import time
    upload_ts = int(time.time())  # unique per batch — prevents collision with existing files

    try:
        for idx, temp_file_path in enumerate(temp_paths):
            file_path = Path(temp_file_path)
            if not file_path.exists():
                continue

            with Image.open(file_path) as img:
                # Convert to RGB if saving to WebP and mode is RGBA with transparency
                if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
                    alpha = img.convert("RGBA").split()[-1]
                    bg = Image.new("RGBA", img.size, (255, 255, 255, 255))
                    bg.paste(img, mask=alpha)
                    img = bg.convert("RGB")
                elif img.mode != "RGB":
                    img = img.convert("RGB")

                # timestamp+idx ensures globally unique filename — never overwrites existing
                prefix = f"{model_type}_{model_id}_{upload_ts}_{idx}"

                # 1. Original (High Quality)
                original_name = f"{prefix}_original.webp"
                img.save(output_dir / original_name, format="WEBP", quality=92)

                # 2. Medium (Max 1200px)
                medium_img = img.copy()
                medium_img.thumbnail((1200, 1200))
                medium_name = f"{prefix}_medium.webp"
                medium_img.save(output_dir / medium_name, format="WEBP", quality=82)

                # 3. Thumb (Max 400px)
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

            file_path.unlink(missing_ok=True)

        async def update_db(the_final_paths: list):
            async with new_session_null_pool() as session:
                from sqlalchemy import select
                orm_model = ArtworksOrm
                result = await session.execute(
                    select(orm_model.images).where(orm_model.id == model_id)
                )
                row = result.scalar_one_or_none()
                existing_images = list(row) if row else []
                merged_images = existing_images + the_final_paths
                stmt = update(orm_model).where(orm_model.id == model_id).values(images=merged_images)
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
