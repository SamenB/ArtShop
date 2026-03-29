# src/services/images.py
import os
import shutil

from fastapi import UploadFile

from src.tasks.tasks import process_and_attach_image


class ImageService:
    TEMP_DIR = "temp"

    @classmethod
    def save_and_process_collection_image(cls, collection_id: int, file: UploadFile) -> str:
        """Save uploaded file and dispatch processing task."""
        os.makedirs(cls.TEMP_DIR, exist_ok=True)
        temp_path = f"{cls.TEMP_DIR}/{file.filename}"

        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        process_and_attach_image.delay(
            model_type="collection", model_id=collection_id, temp_paths=[temp_path]
        )
        return temp_path
