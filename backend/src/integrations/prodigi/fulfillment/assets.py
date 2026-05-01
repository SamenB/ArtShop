from __future__ import annotations

import asyncio
import base64
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import quote

from src.config import settings
from src.integrations.prodigi.fulfillment.contract import file_md5


class AssetPublicationError(RuntimeError):
    pass


@dataclass(slots=True)
class PublishedAsset:
    backend: str
    public_url: str | None
    storage_key: str | None = None
    bucket: str | None = None
    md5_hash: str | None = None
    etag: str | None = None
    metadata: dict[str, Any] | None = None


class ProdigiFulfillmentAssetPublisher:
    """
    Publishes rendered order assets to the public URL Prodigi will download.

    The local backend is kept for development and existing /static behavior.
    The s3_compatible backend is the durable path for real Prodigi submissions.
    """

    def __init__(self, settings_obj: Any = settings):
        self.settings = settings_obj

    @property
    def backend(self) -> str:
        return str(getattr(self.settings, "PRINT_ASSET_STORAGE_BACKEND", "local") or "local")

    async def publish_rendered_asset(
        self,
        *,
        order_id: int,
        order_item_id: int,
        rendered: dict[str, Any],
        md5_hash: str | None = None,
    ) -> PublishedAsset:
        file_path = self._rendered_file_path(rendered)
        resolved_md5 = md5_hash or file_md5(str(file_path))
        if self.backend == "local":
            return PublishedAsset(
                backend="local",
                public_url=self._local_public_asset_url(rendered.get("file_url")),
                md5_hash=resolved_md5,
                metadata={"file_path": str(file_path), "file_url": rendered.get("file_url")},
            )
        if self.backend != "s3_compatible":
            raise AssetPublicationError(
                "Unsupported PRINT_ASSET_STORAGE_BACKEND. Use 'local' or 's3_compatible'."
            )

        config = self._s3_config()
        key = self._asset_key(
            order_id=order_id,
            order_item_id=order_item_id,
            md5_hash=resolved_md5,
        )
        metadata = {
            "md5-hash": resolved_md5 or "",
            "artshop-order-id": str(order_id),
            "artshop-order-item-id": str(order_item_id),
        }
        try:
            upload_response = await asyncio.to_thread(
                self._upload_s3_object,
                file_path,
                bucket=config["bucket"],
                key=key,
                endpoint_url=config["endpoint_url"],
                region=config["region"],
                access_key_id=config["access_key_id"],
                secret_access_key=config["secret_access_key"],
                metadata=metadata,
                md5_hash=resolved_md5,
            )
        except AssetPublicationError:
            raise
        except Exception as exc:
            raise AssetPublicationError(f"S3 asset upload failed: {exc}") from exc

        return PublishedAsset(
            backend="s3_compatible",
            public_url=self._public_url(config["public_base_url"], key),
            storage_key=key,
            bucket=config["bucket"],
            md5_hash=resolved_md5,
            etag=self._normalize_etag(upload_response.get("ETag")),
            metadata=metadata,
        )

    def _rendered_file_path(self, rendered: dict[str, Any]) -> Path:
        value = rendered.get("file_path")
        if not value:
            raise AssetPublicationError("Rendered asset has no local file_path to publish.")
        file_path = Path(str(value))
        if not file_path.exists():
            raise AssetPublicationError(f"Rendered asset file does not exist: {file_path}")
        return file_path

    def _s3_config(self) -> dict[str, str | None]:
        required = {
            "PRINT_ASSET_BUCKET": getattr(self.settings, "PRINT_ASSET_BUCKET", None),
            "PRINT_ASSET_REGION": getattr(self.settings, "PRINT_ASSET_REGION", None),
            "PRINT_ASSET_ACCESS_KEY_ID": getattr(
                self.settings, "PRINT_ASSET_ACCESS_KEY_ID", None
            ),
            "PRINT_ASSET_SECRET_ACCESS_KEY": getattr(
                self.settings, "PRINT_ASSET_SECRET_ACCESS_KEY", None
            ),
            "PRINT_ASSET_PUBLIC_BASE_URL": getattr(
                self.settings, "PRINT_ASSET_PUBLIC_BASE_URL", None
            ),
        }
        missing = [name for name, value in required.items() if not str(value or "").strip()]
        if missing:
            raise AssetPublicationError(
                "Prodigi S3 asset storage is not configured. Missing: "
                + ", ".join(missing)
                + "."
            )
        return {
            "bucket": str(required["PRINT_ASSET_BUCKET"]),
            "endpoint_url": self._optional_str(
                getattr(self.settings, "PRINT_ASSET_ENDPOINT_URL", None)
            ),
            "region": str(required["PRINT_ASSET_REGION"]),
            "access_key_id": str(required["PRINT_ASSET_ACCESS_KEY_ID"]),
            "secret_access_key": str(required["PRINT_ASSET_SECRET_ACCESS_KEY"]),
            "public_base_url": str(required["PRINT_ASSET_PUBLIC_BASE_URL"]),
        }

    def _asset_key(self, *, order_id: int, order_item_id: int, md5_hash: str | None) -> str:
        prefix = str(getattr(self.settings, "PRINT_ASSET_PREFIX", "prodigi") or "prodigi")
        clean_prefix = "/".join(part for part in prefix.strip("/").split("/") if part)
        fingerprint = md5_hash or "unhashed"
        key = f"orders/{order_id}/items/{order_item_id}/{fingerprint}.png"
        return f"{clean_prefix}/{key}" if clean_prefix else key

    def _public_url(self, public_base_url: str, key: str) -> str:
        return f"{public_base_url.rstrip('/')}/{quote(key, safe='/')}"

    def _local_public_asset_url(self, file_url: str | None) -> str | None:
        if not file_url:
            return None
        if file_url.startswith("http://") or file_url.startswith("https://"):
            return file_url
        if file_url.startswith("/"):
            return f"{str(getattr(self.settings, 'PUBLIC_BASE_URL', '')).rstrip('/')}{file_url}"
        return file_url

    def _upload_s3_object(
        self,
        file_path: Path,
        *,
        bucket: str,
        key: str,
        endpoint_url: str | None,
        region: str,
        access_key_id: str,
        secret_access_key: str,
        metadata: dict[str, str],
        md5_hash: str | None,
    ) -> dict[str, Any]:
        try:
            import boto3
            from botocore.config import Config
        except ImportError as exc:
            raise AssetPublicationError(
                "boto3 is required for PRINT_ASSET_STORAGE_BACKEND=s3_compatible."
            ) from exc

        client = boto3.client(
            "s3",
            endpoint_url=endpoint_url,
            region_name=region,
            aws_access_key_id=access_key_id,
            aws_secret_access_key=secret_access_key,
            config=Config(
                connect_timeout=10,
                read_timeout=120,
                retries={"max_attempts": 2, "mode": "standard"},
            ),
        )
        extra_args: dict[str, Any] = {}
        if md5_hash:
            extra_args["ContentMD5"] = base64.b64encode(bytes.fromhex(md5_hash)).decode("ascii")
        with file_path.open("rb") as handle:
            return client.put_object(
                Bucket=bucket,
                Key=key,
                Body=handle,
                ContentType="image/png",
                CacheControl="public, max-age=31536000, immutable",
                Metadata=metadata,
                **extra_args,
            )

    def _optional_str(self, value: Any) -> str | None:
        normalized = str(value or "").strip()
        return normalized or None

    def _normalize_etag(self, value: Any) -> str | None:
        normalized = str(value or "").strip().strip('"').lower()
        return normalized or None
