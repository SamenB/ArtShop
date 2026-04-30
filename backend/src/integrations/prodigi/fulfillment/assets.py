from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol
from urllib.parse import quote

from src.config import settings
from src.integrations.prodigi.fulfillment.contract import public_asset_url


class S3ClientProtocol(Protocol):
    def put_object(self, **kwargs: Any) -> Any: ...


@dataclass(slots=True)
class FulfillmentAssetPublication:
    backend: str
    url: str | None
    key: str | None = None
    bucket: str | None = None
    etag: str | None = None
    uploaded: bool = False
    error: str | None = None
    missing_settings: list[str] | None = None
    metadata: dict[str, Any] | None = None

    @property
    def ok(self) -> bool:
        return bool(self.url and self.error is None)


class ProdigiFulfillmentAssetStorage:
    """
    Publishes rendered fulfillment PNGs to a URL Prodigi can fetch.

    The render pipeline remains local and deterministic. This class owns the
    final public delivery step only, so normal artwork/static uploads do not get
    coupled to the print-order fulfillment contract.
    """

    def __init__(
        self,
        *,
        backend: str | None = None,
        s3_client: S3ClientProtocol | None = None,
    ) -> None:
        self.backend = backend or settings.PRINT_ASSET_STORAGE_BACKEND
        self._s3_client = s3_client

    def publish_rendered_asset(
        self,
        *,
        order_id: int,
        order_item_id: int,
        rendered: dict[str, Any],
        md5_hash: str | None,
    ) -> FulfillmentAssetPublication:
        if self.backend == "local":
            url = public_asset_url(rendered.get("file_url"))
            return FulfillmentAssetPublication(
                backend="local",
                url=url,
                uploaded=False,
                metadata={
                    "file_path": rendered.get("file_path"),
                    "file_url": rendered.get("file_url"),
                    "md5_hash": md5_hash,
                },
            )
        if self.backend == "s3_compatible":
            return self._publish_to_s3(
                order_id=order_id,
                order_item_id=order_item_id,
                rendered=rendered,
                md5_hash=md5_hash,
            )
        return FulfillmentAssetPublication(
            backend=self.backend,
            url=None,
            error=(
                "Unsupported PRINT_ASSET_STORAGE_BACKEND. "
                "Use local or s3_compatible."
            ),
        )

    def build_object_key(
        self,
        *,
        order_id: int,
        order_item_id: int,
        md5_hash: str | None,
        file_path: str | None,
    ) -> str:
        digest = md5_hash or self._file_sha256(file_path) or "unhashed"
        prefix = self._normalized_prefix(settings.PRINT_ASSET_PREFIX)
        key = f"orders/{order_id}/items/{order_item_id}/{digest}.png"
        return f"{prefix}/{key}" if prefix else key

    def _publish_to_s3(
        self,
        *,
        order_id: int,
        order_item_id: int,
        rendered: dict[str, Any],
        md5_hash: str | None,
    ) -> FulfillmentAssetPublication:
        missing = self._missing_s3_settings()
        if missing:
            return FulfillmentAssetPublication(
                backend="s3_compatible",
                url=None,
                bucket=settings.PRINT_ASSET_BUCKET,
                error=(
                    "Fulfillment asset object storage is not fully configured."
                ),
                missing_settings=missing,
            )

        file_path = rendered.get("file_path")
        path = Path(str(file_path)) if file_path else None
        if path is None or not path.exists():
            return FulfillmentAssetPublication(
                backend="s3_compatible",
                url=None,
                bucket=settings.PRINT_ASSET_BUCKET,
                error="Rendered PNG file does not exist and cannot be uploaded.",
                metadata={"file_path": file_path},
            )

        key = self.build_object_key(
            order_id=order_id,
            order_item_id=order_item_id,
            md5_hash=md5_hash,
            file_path=str(path),
        )
        public_url = self._public_url_for_key(key)
        metadata = {
            "md5": md5_hash or "",
            "artshop-order-id": str(order_id),
            "artshop-order-item-id": str(order_item_id),
        }
        try:
            response = self._client().put_object(
                Bucket=settings.PRINT_ASSET_BUCKET,
                Key=key,
                Body=path.read_bytes(),
                ContentType="image/png",
                CacheControl="public, max-age=31536000, immutable",
                Metadata={key: value for key, value in metadata.items() if value},
            )
        except Exception as exc:
            return FulfillmentAssetPublication(
                backend="s3_compatible",
                url=public_url,
                key=key,
                bucket=settings.PRINT_ASSET_BUCKET,
                error=f"Object storage upload failed: {exc}",
                metadata={"file_path": str(path), "md5_hash": md5_hash},
            )

        return FulfillmentAssetPublication(
            backend="s3_compatible",
            url=public_url,
            key=key,
            bucket=settings.PRINT_ASSET_BUCKET,
            etag=self._response_etag(response),
            uploaded=True,
            metadata={"file_path": str(path), "md5_hash": md5_hash},
        )

    def _client(self) -> S3ClientProtocol:
        if self._s3_client is not None:
            return self._s3_client
        try:
            import boto3
        except ImportError as exc:
            raise RuntimeError(
                "boto3 is required for PRINT_ASSET_STORAGE_BACKEND=s3_compatible."
            ) from exc
        self._s3_client = boto3.client(
            "s3",
            endpoint_url=settings.PRINT_ASSET_ENDPOINT_URL,
            region_name=settings.PRINT_ASSET_REGION or "auto",
            aws_access_key_id=settings.PRINT_ASSET_ACCESS_KEY_ID,
            aws_secret_access_key=settings.PRINT_ASSET_SECRET_ACCESS_KEY,
        )
        return self._s3_client

    def _missing_s3_settings(self) -> list[str]:
        required = {
            "PRINT_ASSET_BUCKET": settings.PRINT_ASSET_BUCKET,
            "PRINT_ASSET_ACCESS_KEY_ID": settings.PRINT_ASSET_ACCESS_KEY_ID,
            "PRINT_ASSET_SECRET_ACCESS_KEY": settings.PRINT_ASSET_SECRET_ACCESS_KEY,
            "PRINT_ASSET_PUBLIC_BASE_URL": settings.PRINT_ASSET_PUBLIC_BASE_URL,
        }
        return [key for key, value in required.items() if not value]

    def _public_url_for_key(self, key: str) -> str:
        base = str(settings.PRINT_ASSET_PUBLIC_BASE_URL or "").rstrip("/")
        return f"{base}/{quote(key, safe='/')}"

    def _file_sha256(self, file_path: str | None) -> str | None:
        if not file_path:
            return None
        path = Path(file_path)
        if not path.exists():
            return None
        digest = hashlib.sha256()
        with path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()

    def _normalized_prefix(self, value: str | None) -> str:
        return "/".join(part for part in (value or "").strip("/").split("/") if part)

    def _response_etag(self, response: Any) -> str | None:
        if isinstance(response, dict):
            return response.get("ETag")
        return None
