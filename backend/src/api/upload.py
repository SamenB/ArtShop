"""
API endpoints for general image uploads.
Handles image validation, processing (conversion to WebP), and optimization.
"""

import asyncio
import os
import shutil
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, File, HTTPException, UploadFile
from PIL import Image

from src.api.dependencies import AdminDep

router = APIRouter(prefix="/upload", tags=["Upload"])


@router.post("/image")
async def upload_image(admin_id: AdminDep, file: UploadFile = File(...)):
    """
    Uploads and processes an image file.
    - Validates that the file is an image.
    - Converts the image to WebP format.
    - Resizes large images to a maximum of 3840px (4K) while maintaining quality.
    - Saves the processed image to the static/images directory.
    Requires admin privileges.
    """
    if not file.content_type.startswith("image/"):
        raise HTTPException(400, "File must be an image")

    output_dir = Path("static/images")
    output_dir.mkdir(parents=True, exist_ok=True)

    filename = f"upload_{uuid4().hex[:8]}.webp"
    temp_path = f"temp/{filename}"
    os.makedirs("temp", exist_ok=True)

    try:
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        def process_image():
            """
            Synchronous image processing logic using PIL.
            Handles transparency, color mode conversion, and downscaling.
            """
            with Image.open(temp_path) as img:
                if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
                    alpha = img.convert("RGBA").split()[-1]
                    bg = Image.new("RGBA", img.size, (255, 255, 255, 255))
                    bg.paste(img, mask=alpha)
                    img = bg.convert("RGB")
                elif img.mode != "RGB":
                    img = img.convert("RGB")

                # Downscale large images but preserve 4K details (up to 3840px) for beautiful hero backgrounds
                max_size = (3840, 3840)
                img.thumbnail(max_size, Image.Resampling.LANCZOS)

                img.save(output_dir / filename, format="WEBP", quality=95)

        await asyncio.to_thread(process_image)

        return {"url": f"/static/images/{filename}"}
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)
