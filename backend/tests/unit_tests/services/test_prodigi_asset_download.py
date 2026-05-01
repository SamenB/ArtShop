import hashlib

import pytest

from src.integrations.prodigi.fulfillment import asset_download


class _FakeResponse:
    def __init__(self, *, status_code=200, body=b"png-bytes", headers=None, url="https://asset.test/file.png"):
        self.status_code = status_code
        self._body = body
        self.headers = headers or {
            "content-type": "image/png",
            "content-length": str(len(body)),
        }
        self.url = url

    async def aiter_bytes(self):
        yield self._body


class _FakeStream:
    def __init__(self, response):
        self.response = response

    async def __aenter__(self):
        return self.response

    async def __aexit__(self, *_):
        return None


class _FakeAsyncClient:
    response = _FakeResponse()

    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        return None

    def stream(self, method, url):
        return _FakeStream(self.response)


@pytest.mark.asyncio
async def test_verify_public_asset_download_passes_with_matching_md5(monkeypatch):
    body = b"png-bytes"
    _FakeAsyncClient.response = _FakeResponse(body=body)
    monkeypatch.setattr(asset_download.httpx, "AsyncClient", _FakeAsyncClient)

    result = await asset_download.verify_public_asset_download(
        "https://asset.test/file.png",
        expected_md5=hashlib.md5(body).hexdigest(),
    )

    assert result["passed"] is True
    assert result["measured"]["downloaded_bytes"] == len(body)
    assert result["measured"]["content_type"] == "image/png"


@pytest.mark.asyncio
async def test_verify_public_asset_download_fails_on_http_error(monkeypatch):
    _FakeAsyncClient.response = _FakeResponse(status_code=404, body=b"not-found")
    monkeypatch.setattr(asset_download.httpx, "AsyncClient", _FakeAsyncClient)

    result = await asset_download.verify_public_asset_download("https://asset.test/missing.png")

    assert result["passed"] is False
    assert result["measured"]["http_status"] == 404
    assert "HTTP 404" in result["error"]


@pytest.mark.asyncio
async def test_verify_public_asset_download_fails_on_md5_mismatch(monkeypatch):
    _FakeAsyncClient.response = _FakeResponse(body=b"other-bytes")
    monkeypatch.setattr(asset_download.httpx, "AsyncClient", _FakeAsyncClient)

    result = await asset_download.verify_public_asset_download(
        "https://asset.test/file.png",
        expected_md5="0" * 32,
    )

    assert result["passed"] is False
    assert result["measured"]["expected_md5_hash"] == "0" * 32
    assert result["error"] == "Downloaded public asset md5 does not match the rendered file md5."
