"""
Schemas for structured artwork print-preparation assets.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class ArtworkPrintAssetAdd(BaseModel):
    artwork_id: int
    provider_key: str
    category_id: str | None = None
    asset_role: str
    slot_size_label: str | None = None
    file_url: str
    file_name: str | None = None
    file_ext: str | None = None
    mime_type: str | None = None
    file_size_bytes: int | None = None
    checksum_sha256: str | None = None
    file_metadata: dict[str, Any] | None = None
    note: str | None = None


class ArtworkPrintAssetPatch(BaseModel):
    file_url: str | None = None
    file_name: str | None = None
    file_ext: str | None = None
    mime_type: str | None = None
    file_size_bytes: int | None = None
    checksum_sha256: str | None = None
    file_metadata: dict[str, Any] | None = None
    note: str | None = None


class ArtworkPrintAsset(BaseModel):
    id: int
    artwork_id: int
    provider_key: str
    category_id: str | None = None
    asset_role: str
    slot_size_label: str | None = None
    file_url: str
    file_name: str | None = None
    file_ext: str | None = None
    mime_type: str | None = None
    file_size_bytes: int | None = None
    checksum_sha256: str | None = None
    file_metadata: dict[str, Any] | None = None
    note: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)
