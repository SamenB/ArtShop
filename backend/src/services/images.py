"""
Service for handling image uploads and asynchronous processing.
Manages temporary storage and dispatches background tasks for image optimization and mapping.
"""

import os
import shutil

from fastapi import UploadFile

from src.tasks.tasks import process_and_attach_image


class ImageService:
    """
    Handles file system operations for uploaded images and integrates with Celery tasks.
    """

    TEMP_DIR = "temp"

    @classmethod
    def save_and_process_collection_image(cls, collection_id: int, file: UploadFile) -> str:
        """
        Saves an uploaded file to a local temporary directory and triggers
        a background task to process the image and attach it to a collection.

        Args:
            collection_id: The ID of the collection to link the image to.
            file: The uploaded image file from FastAPI.

        Returns:
            str: The local path to the temporary file.
        """
        os.makedirs(cls.TEMP_DIR, exist_ok=True)
        temp_path = os.path.join(cls.TEMP_DIR, file.filename)

        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Dispatch asynchronous task for processing and permanent storage.
        process_and_attach_image.delay(
            model_type="collection", model_id=collection_id, temp_paths=[temp_path]
        )
        return temp_path
