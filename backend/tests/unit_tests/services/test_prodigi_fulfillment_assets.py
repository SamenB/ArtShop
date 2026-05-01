from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest

from src.integrations.prodigi.fulfillment.assets import (
    AssetPublicationError,
    ProdigiFulfillmentAssetPublisher,
)


def _settings(**overrides):
    defaults = {
        "PUBLIC_BASE_URL": "http://localhost:8000",
        "PRINT_ASSET_STORAGE_BACKEND": "s3_compatible",
        "PRINT_ASSET_BUCKET": "artshop-prodigi-assets",
        "PRINT_ASSET_ENDPOINT_URL": None,
        "PRINT_ASSET_REGION": "eu-north-1",
        "PRINT_ASSET_ACCESS_KEY_ID": "access",
        "PRINT_ASSET_SECRET_ACCESS_KEY": "secret",
        "PRINT_ASSET_PUBLIC_BASE_URL": (
            "https://artshop-prodigi-assets.s3.eu-north-1.amazonaws.com"
        ),
        "PRINT_ASSET_PREFIX": "prodigi",
    }
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


@pytest.mark.asyncio
async def test_s3_publisher_builds_deterministic_key_and_public_url(tmp_path, monkeypatch):
    file_path = tmp_path / "asset.png"
    file_path.write_bytes(b"png-bytes")
    uploads = []
    publisher = ProdigiFulfillmentAssetPublisher(_settings())

    def fake_upload(path: Path, **kwargs):
        uploads.append({"path": path, **kwargs})
        return {"ETag": f'"{"a" * 32}"'}

    monkeypatch.setattr(publisher, "_upload_s3_object", fake_upload)

    published = await publisher.publish_rendered_asset(
        order_id=31,
        order_item_id=28,
        rendered={"file_path": str(file_path), "file_url": "/static/print-orders/31/28/a.png"},
        md5_hash="a" * 32,
    )

    assert published.backend == "s3_compatible"
    assert published.storage_key == f"prodigi/orders/31/items/28/{'a' * 32}.png"
    assert published.public_url == (
        f"https://artshop-prodigi-assets.s3.eu-north-1.amazonaws.com/"
        f"prodigi/orders/31/items/28/{'a' * 32}.png"
    )
    assert published.etag == "a" * 32
    assert uploads[0]["bucket"] == "artshop-prodigi-assets"
    assert uploads[0]["metadata"]["md5-hash"] == "a" * 32
    assert uploads[0]["md5_hash"] == "a" * 32


@pytest.mark.asyncio
async def test_s3_publisher_fails_with_missing_required_config(tmp_path):
    file_path = tmp_path / "asset.png"
    file_path.write_bytes(b"png-bytes")
    publisher = ProdigiFulfillmentAssetPublisher(
        _settings(PRINT_ASSET_BUCKET="", PRINT_ASSET_PUBLIC_BASE_URL="")
    )

    with pytest.raises(AssetPublicationError) as exc:
        await publisher.publish_rendered_asset(
            order_id=1,
            order_item_id=2,
            rendered={"file_path": str(file_path), "file_url": "/static/a.png"},
            md5_hash="b" * 32,
        )

    assert "PRINT_ASSET_BUCKET" in str(exc.value)
    assert "PRINT_ASSET_PUBLIC_BASE_URL" in str(exc.value)


@pytest.mark.asyncio
async def test_local_publisher_keeps_existing_static_url(tmp_path):
    file_path = tmp_path / "asset.png"
    file_path.write_bytes(b"png-bytes")
    publisher = ProdigiFulfillmentAssetPublisher(
        _settings(PRINT_ASSET_STORAGE_BACKEND="local", PUBLIC_BASE_URL="https://site.test")
    )

    published = await publisher.publish_rendered_asset(
        order_id=1,
        order_item_id=2,
        rendered={"file_path": str(file_path), "file_url": "/static/print-orders/a.png"},
        md5_hash="c" * 32,
    )

    assert published.backend == "local"
    assert published.public_url == "https://site.test/static/print-orders/a.png"
