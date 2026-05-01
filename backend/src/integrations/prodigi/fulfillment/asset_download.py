from __future__ import annotations

import hashlib
from typing import Any

import httpx


async def verify_public_asset_download(
    url: str | None,
    *,
    expected_md5: str | None = None,
    timeout_seconds: float = 30.0,
) -> dict[str, Any]:
    if not url:
        return {
            "passed": False,
            "measured": {"asset_url": url},
            "error": "Missing public asset URL.",
        }

    measured: dict[str, Any] = {"asset_url": url}
    digest = hashlib.md5()
    downloaded_bytes = 0
    try:
        async with httpx.AsyncClient(timeout=timeout_seconds, follow_redirects=True) as client:
            async with client.stream("GET", url) as response:
                measured.update(
                    {
                        "http_status": response.status_code,
                        "content_type": response.headers.get("content-type"),
                        "content_length": response.headers.get("content-length"),
                        "final_url": str(response.url),
                    }
                )
                if response.status_code < 200 or response.status_code >= 300:
                    return {
                        "passed": False,
                        "measured": measured,
                        "error": f"Public asset download returned HTTP {response.status_code}.",
                    }
                async for chunk in response.aiter_bytes():
                    downloaded_bytes += len(chunk)
                    digest.update(chunk)
    except Exception as exc:
        measured["downloaded_bytes"] = downloaded_bytes
        return {
            "passed": False,
            "measured": measured,
            "error": f"Public asset download failed: {exc}",
        }

    actual_md5 = digest.hexdigest()
    measured.update(
        {
            "downloaded_bytes": downloaded_bytes,
            "md5_hash": actual_md5,
            "expected_md5_hash": expected_md5,
        }
    )
    if downloaded_bytes <= 0:
        return {
            "passed": False,
            "measured": measured,
            "error": "Public asset URL returned an empty file.",
        }
    if expected_md5 and actual_md5 != expected_md5:
        return {
            "passed": False,
            "measured": measured,
            "error": "Downloaded public asset md5 does not match the rendered file md5.",
        }
    return {"passed": True, "measured": measured, "error": None}
