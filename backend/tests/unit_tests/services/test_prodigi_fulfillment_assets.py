from pathlib import Path

from src.config import settings
from src.integrations.prodigi.fulfillment.assets import ProdigiFulfillmentAssetStorage


class _FakeS3Client:
    def __init__(self):
        self.calls = []

    def put_object(self, **kwargs):
        self.calls.append(kwargs)
        return {"ETag": '"etag-test"'}


def test_s3_asset_storage_builds_deterministic_key_and_public_url(monkeypatch):
    file_path = Path("temp/unit-test-assets/render-s3.png")
    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_bytes(b"png-bytes")
    monkeypatch.setattr(settings, "PRINT_ASSET_STORAGE_BACKEND", "s3_compatible")
    monkeypatch.setattr(settings, "PRINT_ASSET_BUCKET", "artshop-prints")
    monkeypatch.setattr(settings, "PRINT_ASSET_ENDPOINT_URL", "https://r2.example.test")
    monkeypatch.setattr(settings, "PRINT_ASSET_REGION", "auto")
    monkeypatch.setattr(settings, "PRINT_ASSET_ACCESS_KEY_ID", "access")
    monkeypatch.setattr(settings, "PRINT_ASSET_SECRET_ACCESS_KEY", "secret")
    monkeypatch.setattr(settings, "PRINT_ASSET_PUBLIC_BASE_URL", "https://assets.example.test")
    monkeypatch.setattr(settings, "PRINT_ASSET_PREFIX", "prodigi")
    client = _FakeS3Client()

    result = ProdigiFulfillmentAssetStorage(
        backend="s3_compatible",
        s3_client=client,
    ).publish_rendered_asset(
        order_id=31,
        order_item_id=28,
        rendered={"file_path": str(file_path), "file_url": "/static/print-orders/31/28/render.png"},
        md5_hash="a" * 32,
    )

    assert result.ok is True
    assert result.uploaded is True
    assert result.key == f"prodigi/orders/31/items/28/{'a' * 32}.png"
    assert result.url == f"https://assets.example.test/prodigi/orders/31/items/28/{'a' * 32}.png"
    assert client.calls[0]["Bucket"] == "artshop-prints"
    assert client.calls[0]["ContentType"] == "image/png"
    assert client.calls[0]["Metadata"]["md5"] == "a" * 32


def test_s3_asset_storage_reports_missing_configuration(monkeypatch):
    file_path = Path("temp/unit-test-assets/render-missing-config.png")
    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_bytes(b"png-bytes")
    monkeypatch.setattr(settings, "PRINT_ASSET_BUCKET", None)
    monkeypatch.setattr(settings, "PRINT_ASSET_ACCESS_KEY_ID", None)
    monkeypatch.setattr(settings, "PRINT_ASSET_SECRET_ACCESS_KEY", None)
    monkeypatch.setattr(settings, "PRINT_ASSET_PUBLIC_BASE_URL", None)

    result = ProdigiFulfillmentAssetStorage(backend="s3_compatible").publish_rendered_asset(
        order_id=31,
        order_item_id=28,
        rendered={"file_path": str(file_path)},
        md5_hash="b" * 32,
    )

    assert result.ok is False
    assert result.error == "Fulfillment asset object storage is not fully configured."
    assert result.missing_settings == [
        "PRINT_ASSET_BUCKET",
        "PRINT_ASSET_ACCESS_KEY_ID",
        "PRINT_ASSET_SECRET_ACCESS_KEY",
        "PRINT_ASSET_PUBLIC_BASE_URL",
    ]


def test_local_asset_storage_keeps_local_url_for_diagnostics(monkeypatch):
    monkeypatch.setattr(settings, "PUBLIC_BASE_URL", "http://localhost:8000")

    result = ProdigiFulfillmentAssetStorage(backend="local").publish_rendered_asset(
        order_id=31,
        order_item_id=28,
        rendered={"file_url": "/static/print-orders/31/28/render.png"},
        md5_hash="c" * 32,
    )

    assert result.backend == "local"
    assert result.uploaded is False
    assert result.url == "http://localhost:8000/static/print-orders/31/28/render.png"
