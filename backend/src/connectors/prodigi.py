"""
Prodigi Print-on-Demand API connector.

Wraps Prodigi REST API v4 for product discovery, pricing, and order submission.
Authentication via X-API-Key header.  No DB dependency — pure HTTP client.

Prodigi API docs: https://www.prodigi.com/print-api/docs/reference/
Live base URL  : https://api.prodigi.com/v4.0
Sandbox base   : https://api.sandbox.prodigi.com/v4.0
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Any

import httpx

from src.config import settings

log = logging.getLogger(__name__)

# ── Constants ──────────────────────────────────────────────────────────────────

PRODIGI_LIVE_URL    = "https://api.prodigi.com/v4.0"
PRODIGI_SANDBOX_URL = "https://api.sandbox.prodigi.com/v4.0"

# SKU families we care about for fine art / poster prints (paper only, unframed).
# These are the Prodigi SKU prefixes that correspond to paper-based prints.
PAPER_SKU_PREFIXES = [
    "GLOBAL-HPR",   # Hahnemühle Photo Rag         – museum-quality fine art
    "GLOBAL-HGE",   # Hahnemühle German Etching     – textured fine art
    "GLOBAL-EMA",   # Enhanced Matte Art Paper       – posters / fine art
    "GLOBAL-FAP",   # Fine Art Paper (generic EMA)   – poster range
    "GLOBAL-BAP",   # Baryta Art Paper               – photo-like fine art
    "GLOBAL-SAP",   # Smooth Art Paper               – mid-range poster
]

# All standard sizes Prodigi offers (width x height in inches).
# We try every combination — invalid ones return 404 and are skipped.
CANDIDATE_SIZES_IN = [
    (5, 7),
    (6, 8),
    (8, 8),
    (8, 10),
    (10, 10),
    (10, 12),
    (10, 13),
    (10, 14),
    (11, 14),
    (12, 16),
    (12, 18),
    (14, 18),
    (16, 20),
    (18, 18),
    (18, 24),
    (20, 20),
    (20, 24),
    (20, 28),
    (20, 30),
    (24, 30),
    (24, 32),
    (24, 36),
    (30, 30),
    (30, 40),
    (36, 36),
    (36, 48),
    (40, 50),
    # Also try portrait versions (taller = first number)
    (7, 5),
    (8, 6),
    (10, 8),
    (14, 11),
    (16, 12),
    (20, 16),
    (24, 18),
    (30, 20),
    (30, 24),
    (36, 24),
    (40, 30),
    (50, 40),
]


# ── Data classes ───────────────────────────────────────────────────────────────

@dataclass
class ProductVariant:
    """One variant of a Prodigi product (a set of attributes that ships to certain countries)."""
    attributes: dict[str, str]
    ships_to: list[str]
    print_area_sizes: dict[str, dict]  # {"default": {"horizontalResolution": N, "verticalResolution": N}}


@dataclass
class ProductDetails:
    """Full product details returned by GET /v4.0/products/{sku}."""
    sku: str
    description: str
    width_in: float
    height_in: float
    attributes: dict[str, list[str]]           # {"wrap": ["Black", "ImageWrap", ...]}
    variants: list[ProductVariant] = field(default_factory=list)

    @property
    def aspect_ratio(self) -> str:
        """Return normalised portrait aspect ratio string e.g. '4:5', '1:1'."""
        w, h = self.width_in, self.height_in
        if w == 0 or h == 0:
            return "unknown"
        from math import gcd
        w_i, h_i = int(round(w * 100)), int(round(h * 100))
        g = gcd(w_i, h_i)
        rw, rh = w_i // g, h_i // g
        # Normalise to portrait (smaller first)
        if rw > rh:
            rw, rh = rh, rw
        return f"{rw}:{rh}"

    def ships_to_country(self, country_code: str) -> bool:
        """True if at least one variant ships to the given ISO country code."""
        cc = country_code.upper()
        return any(cc in v.ships_to for v in self.variants)

    def variants_for_country(self, country_code: str) -> list[ProductVariant]:
        cc = country_code.upper()
        return [v for v in self.variants if cc in v.ships_to]


# ── HTTP client ────────────────────────────────────────────────────────────────

class ProdigiClient:
    """
    Async HTTP client for Prodigi API v4.

    Usage:
        async with ProdigiClient() as client:
            product = await client.get_product("GLOBAL-HPR-8X10")
    """

    def __init__(self, api_key: str | None = None, sandbox: bool = False):
        self.api_key = api_key or settings.PRODIGI_API_KEY
        self.base_url = PRODIGI_SANDBOX_URL if sandbox else PRODIGI_LIVE_URL
        self._client: httpx.AsyncClient | None = None

    async def __aenter__(self) -> "ProdigiClient":
        self._client = httpx.AsyncClient(
            base_url=self.base_url,
            headers={
                "X-API-Key": self.api_key,
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            timeout=30.0,
        )
        return self

    async def __aexit__(self, *_: Any) -> None:
        if self._client:
            await self._client.aclose()

    # ── Low-level helpers ──────────────────────────────────────────────────────

    async def get(self, path: str, **params: Any) -> dict | None:
        """
        Perform a GET request.  Returns parsed JSON dict or None on 404.
        Raises httpx.HTTPStatusError on other errors.
        """
        assert self._client, "Use as async context manager"
        resp = await self._client.get(path, params=params or None)
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        return resp.json()

    async def post(self, path: str, body: dict) -> dict:
        assert self._client, "Use as async context manager"
        resp = await self._client.post(path, json=body)
        resp.raise_for_status()
        return resp.json()

    # ── Product Details ────────────────────────────────────────────────────────

    async def get_product(self, sku: str) -> ProductDetails | None:
        """
        Fetch full product details for a single SKU.
        Returns None if SKU does not exist.
        """
        data = await self.get(f"/products/{sku}")
        if not data or data.get("outcome", "").lower() not in ("ok", "created"):
            return None

        p = data.get("product") or data  # Some responses wrap in "product"
        dims = p.get("productDimensions", {})

        variants = []
        for v in p.get("variants", []):
            variants.append(ProductVariant(
                attributes=v.get("attributes", {}),
                ships_to=v.get("shipsTo", []),
                print_area_sizes=v.get("printAreaSizes", {}),
            ))

        return ProductDetails(
            sku=p.get("sku", sku).upper(),
            description=p.get("description", ""),
            width_in=float(dims.get("width", 0)),
            height_in=float(dims.get("height", 0)),
            attributes=p.get("attributes", {}),
            variants=variants,
        )

    # ── Catalog discovery ──────────────────────────────────────────────────────

    async def discover_paper_prints(
        self,
        country_code: str,
        target_aspect_ratios: list[str] | None = None,
        sku_prefixes: list[str] | None = None,
        max_concurrent: int = 10,
    ) -> list[ProductDetails]:
        """
        Discover all available paper print products for a country by probing
        known SKU patterns concurrently.

        Args:
            country_code: ISO 3166-1 alpha-2, e.g. "DE", "GB", "US"
            target_aspect_ratios: If provided, only return products matching
                these ratios (normalised portrait form, e.g. ["4:5", "1:1"]).
                None = return all ratios.
            sku_prefixes: Override default PAPER_SKU_PREFIXES.
            max_concurrent: Limit parallel HTTP requests to avoid rate limiting.

        Returns:
            Sorted list of ProductDetails that ship to the given country.
        """
        prefixes = sku_prefixes or PAPER_SKU_PREFIXES
        cc = country_code.upper()

        # Build candidate SKUs: prefix + WxH for each size combination
        candidates: list[str] = []
        for prefix in prefixes:
            for w, h in CANDIDATE_SIZES_IN:
                candidates.append(f"{prefix}-{w}X{h}")

        log.info("Probing %d candidate SKUs for country=%s...", len(candidates), cc)

        semaphore = asyncio.Semaphore(max_concurrent)
        results: list[ProductDetails] = []

        async def probe(sku: str) -> None:
            async with semaphore:
                try:
                    product = await self.get_product(sku)
                    if product and product.ships_to_country(cc):
                        results.append(product)
                        log.debug("Found: %s (%s) → %s", sku, product.aspect_ratio, product.description)
                except Exception as exc:
                    log.warning("Error probing %s: %s", sku, exc)

        await asyncio.gather(*[probe(sku) for sku in candidates])

        # Filter by aspect ratio if requested (normalise ratio strings first)
        if target_aspect_ratios:
            normalised_targets = {_normalise_ratio(r) for r in target_aspect_ratios}
            results = [p for p in results if p.aspect_ratio in normalised_targets]

        # Sort: by aspect ratio, then by size (area)
        results.sort(key=lambda p: (p.aspect_ratio, p.width_in * p.height_in))
        log.info("Discovery complete: %d products found for %s", len(results), cc)
        return results

    # ── Quotes ────────────────────────────────────────────────────────────────

    async def get_quote(
        self,
        sku: str,
        destination_country: str,
        currency: str = "EUR",
        attributes: dict | None = None,
        shipping_method: str | None = None,
    ) -> dict:
        """
        Get pricing quote for a single SKU shipping to a country.

        Returns the full quotes response dict:
            {"outcome": "Created", "quotes": [...]}
        """
        body: dict[str, Any] = {
            "destinationCountryCode": destination_country.upper(),
            "currencyCode": currency,
            "items": [
                {
                    "sku": sku,
                    "copies": 1,
                    "attributes": attributes or {},
                    "assets": [{"printArea": "default"}],
                }
            ],
        }
        if shipping_method:
            body["shippingMethod"] = shipping_method

        return await self.post("/quotes", body)


# ── Utilities ──────────────────────────────────────────────────────────────────

def _normalise_ratio(raw: str) -> str:
    """
    Normalise aspect ratio to smallest-numerator portrait form.
    '5:4' → '4:5',  '16:9' → '9:16',  '1:1' → '1:1'
    """
    raw = raw.strip().replace(" ", "")
    if ":" not in raw:
        return raw
    a, b = raw.split(":", 1)
    try:
        ai, bi = int(a), int(b)
    except ValueError:
        return raw
    if ai == bi:
        return "1:1"
    if ai > bi:
        ai, bi = bi, ai
    return f"{ai}:{bi}"
