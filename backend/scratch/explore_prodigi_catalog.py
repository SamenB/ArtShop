"""
Prodigi Catalog Explorer
========================
Run from the backend/ directory:

    python scratch/explore_prodigi_catalog.py

What it does:
1. Probes all known paper-print SKU patterns against Prodigi Live API
2. Checks which ones ship to Germany (DE)
3. Groups by aspect ratio and product family
4. Dumps a clean report + saves raw JSON

Requirements (already in requirements.txt): httpx, python-dotenv
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

# ── Bootstrap: load .env so we get PRODIGI_API_KEY ───────────────────────────
ROOT = Path(__file__).resolve().parents[2]  # repo root (ArtShop/)
ENV_FILE = ROOT / ".env"

try:
    from dotenv import load_dotenv
    load_dotenv(ENV_FILE)
    print(f"[OK] Loaded .env from {ENV_FILE}")
except ImportError:
    print("[WARN] python-dotenv not found -- make sure PRODIGI_API_KEY is in env")

API_KEY = os.environ.get("PRODIGI_API_KEY", "")
if not API_KEY:
    print("[ERR] PRODIGI_API_KEY not set. Check your .env file.")
    sys.exit(1)

print(f"[OK] API key loaded: {API_KEY[:8]}...")

import httpx

# ── Configuration ─────────────────────────────────────────────────────────────

BASE_URL = "https://api.prodigi.com/v4.0"   # Live API (read-only discovery is free)

TARGET_COUNTRY   = "DE"                      # Germany
TARGET_CURRENCY  = "EUR"

# Aspect ratios we care about (add more as needed)
TARGET_RATIOS = {
    "4:5",   # portrait standard
    "1:1",   # square
    "2:3",   # classic portrait
    "3:4",   # medium format portrait
    "9:16",  # vertical/mobile
}

# Paper print SKU families (prefix → human name)
SKU_FAMILIES: dict[str, str] = {
    "GLOBAL-HPR": "Hahnemühle Photo Rag",
    "GLOBAL-HGE": "Hahnemühle German Etching",
    "GLOBAL-EMA": "Enhanced Matte Art Paper (Poster)",
    "GLOBAL-FAP": "Fine Art Paper",
    "GLOBAL-BAP": "Baryta Art Paper",
    "GLOBAL-SAP": "Smooth Art Paper",
    "GLOBAL-LPP": "Lustre Photo Paper",
}

# All size candidates: width × height (inches)
# We try both orientations — Prodigi uses landscape for some SKUs
SIZES: list[tuple[int, int]] = [
    # Square
    (6, 6), (8, 8), (10, 10), (12, 12), (14, 14), (16, 16), (18, 18),
    (20, 20), (24, 24), (30, 30), (36, 36),
    # 4:5 (portrait) and 5:4 (landscape)
    (8, 10), (10, 8),
    (16, 20), (20, 16),
    (24, 30), (30, 24),
    (32, 40), (40, 32),
    # 2:3 and 3:2
    (8, 12), (12, 8),
    (10, 15), (15, 10),
    (12, 18), (18, 12),
    (16, 24), (24, 16),
    (20, 30), (30, 20),
    (24, 36), (36, 24),
    # 3:4 and 4:3
    (9, 12), (12, 9),
    (12, 16), (16, 12),
    (15, 20), (20, 15),
    (18, 24), (24, 18),
    (21, 28), (28, 21),
    # Other common sizes
    (5, 7), (7, 5),
    (11, 14), (14, 11),
    (13, 18), (18, 13),
    (20, 28), (28, 20),
    (40, 50), (50, 40),
    (40, 60), (60, 40),
]


# ── Helpers ───────────────────────────────────────────────────────────────────

def gcd(a: int, b: int) -> int:
    while b:
        a, b = b, a % b
    return a


def calc_ratio(w: float, h: float) -> str:
    """Normalised portrait aspect ratio string, e.g. '4:5'."""
    if w == 0 or h == 0:
        return "?"
    wi, hi = int(round(w * 100)), int(round(h * 100))
    g = gcd(wi, hi)
    rw, rh = wi // g, hi // g
    if rw > rh:
        rw, rh = rh, rw
    return f"{rw}:{rh}"


# ── HTTP helpers ──────────────────────────────────────────────────────────────

HEADERS = {
    "X-API-Key": API_KEY,
    "Accept": "application/json",
    "Content-Type": "application/json",
}


async def fetch_product(client: httpx.AsyncClient, sku: str) -> dict | None:
    """GET /products/{sku} → parsed JSON or None if 404."""
    try:
        r = await client.get(f"/products/{sku}", headers=HEADERS)
        if r.status_code == 404:
            return None
        r.raise_for_status()
        return r.json()
    except Exception as exc:
        print(f"  ⚠ Error fetching {sku}: {exc}")
        return None


async def fetch_quote(
    client: httpx.AsyncClient,
    sku: str,
    country: str,
    currency: str,
) -> dict | None:
    """POST /quotes for a single SKU → full quote response."""
    body = {
        "destinationCountryCode": country,
        "currencyCode": currency,
        "items": [{"sku": sku, "copies": 1, "attributes": {}, "assets": [{"printArea": "default"}]}],
    }
    try:
        r = await client.post("/quotes", headers=HEADERS, json=body)
        r.raise_for_status()
        return r.json()
    except Exception as exc:
        print(f"  ⚠ Quote error for {sku}: {exc}")
        return None


# ── Discovery ─────────────────────────────────────────────────────────────────

async def discover_catalog(
    client: httpx.AsyncClient,
    country: str,
    max_concurrent: int = 15,
) -> list[dict]:
    """
    Probe all SKU candidates, collect those shipping to `country`.
    Returns list of enriched product dicts.
    """
    # Build all candidate SKUs
    candidates: list[str] = []
    for prefix in SKU_FAMILIES:
        for w, h in SIZES:
            candidates.append(f"{prefix}-{w}X{h}")

    print(f"\n[PROBE] Probing {len(candidates)} SKU candidates for {country}...")
    print(f"   Families: {', '.join(SKU_FAMILIES.keys())}")

    sem = asyncio.Semaphore(max_concurrent)
    found: list[dict] = []
    probed = 0
    lock = asyncio.Lock()

    async def probe(sku: str) -> None:
        nonlocal probed
        async with sem:
            data = await fetch_product(client, sku)
            async with lock:
                probed += 1
                if probed % 50 == 0:
                    print(f"   ... {probed}/{len(candidates)} probed, {len(found)} found so far")

            if not data:
                return

            product = data.get("product") or data
            variants: list[dict] = product.get("variants", [])
            ships_to_country = any(country in v.get("shipsTo", []) for v in variants)

            if not ships_to_country:
                return

            dims = product.get("productDimensions", {})
            w = float(dims.get("width", 0))
            h = float(dims.get("height", 0))
            ratio = calc_ratio(w, h)

            matching_variants = [v for v in variants if country in v.get("shipsTo", [])]

            async with lock:
                found.append({
                    "sku": product.get("sku", sku).upper(),
                    "description": product.get("description", ""),
                    "width_in": w,
                    "height_in": h,
                    "aspect_ratio": ratio,
                    "attributes": product.get("attributes", {}),
                    "variant_count": len(matching_variants),
                    "variants": matching_variants,
                })
                print(f"   [+] {sku:35s} | {ratio:6s} | {w:.0f}x{h:.0f}in | {product.get('description','')[:60]}")

    await asyncio.gather(*[probe(sku) for sku in candidates])
    return found


async def enrich_with_quotes(
    client: httpx.AsyncClient,
    products: list[dict],
    country: str,
    currency: str,
    max_concurrent: int = 5,
) -> None:
    """Add quote pricing to found products (in-place)."""
    print(f"\n[QUOTE] Fetching quotes for {len(products)} products...")

    sem = asyncio.Semaphore(max_concurrent)

    async def add_quote(p: dict) -> None:
        async with sem:
            q_data = await fetch_quote(client, p["sku"], country, currency)
            if not q_data:
                return
            quotes = q_data.get("quotes", [])
            p["quotes"] = quotes
            # Pick Standard shipping quote as primary price
            for q in quotes:
                if q.get("shipmentMethod", "").lower() == "standard":
                    items = q.get("items", [])
                    if items:
                        p["unit_cost"] = items[0].get("unitCost", {})
                    shipments = q.get("shipments", [])
                    if shipments:
                        p["shipping_cost"] = shipments[0].get("cost", {})
                    break
            # Fallback: use first available quote
            if "unit_cost" not in p and quotes:
                items = quotes[0].get("items", [])
                if items:
                    p["unit_cost"] = items[0].get("unitCost", {})

    await asyncio.gather(*[add_quote(p) for p in products])


# ── Reporting ─────────────────────────────────────────────────────────────────

def print_report(products: list[dict], country: str) -> None:
    """Print a human-readable catalog report grouped by family and ratio."""
    print(f"\n{'='*80}")
    print(f"  PRODIGI CATALOG REPORT - Country: {country}")
    print(f"  Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print(f"  Total products found: {len(products)}")
    print(f"{'='*80}")

    # Group by family (SKU prefix) -> aspect ratio -> products
    by_family: dict[str, dict[str, list[dict]]] = defaultdict(lambda: defaultdict(list))
    unknown_family: list[dict] = []

    for p in sorted(products, key=lambda x: (x["aspect_ratio"], x["sku"])):
        matched_prefix = None
        for prefix in SKU_FAMILIES:
            if p["sku"].startswith(prefix):
                matched_prefix = prefix
                break
        if matched_prefix:
            by_family[matched_prefix][p["aspect_ratio"]].append(p)
        else:
            unknown_family.append(p)

    for prefix, family_name in SKU_FAMILIES.items():
        if prefix not in by_family:
            continue
        print(f"\n[{prefix}] {family_name}")
        print(f"   {'-'*60}")

        for ratio in sorted(by_family[prefix].keys()):
            ratio_highlight = "[TARGET]" if ratio in TARGET_RATIOS else "       "
            print(f"\n   {ratio_highlight} Ratio {ratio}:")
            for p in by_family[prefix][ratio]:
                size_str = f"{p['width_in']:.0f}×{p['height_in']:.0f}\""
                cost_str = ""
                if "unit_cost" in p:
                    uc = p["unit_cost"]
                    cost_str = f"   cost: {uc.get('amount','?')} {uc.get('currency','')}"
                    if "shipping_cost" in p:
                        sc = p["shipping_cost"]
                        cost_str += f" + {sc.get('amount','?')} {sc.get('currency','')} ship"
                attrs = p.get("attributes", {})
                attrs_str = ""
                if attrs:
                    attrs_str = f"  attrs: {', '.join(k + ': ' + '/'.join(v) for k, v in attrs.items())}"
                print(f"      {p['sku']:40s} {size_str:12s}{cost_str}{attrs_str}")
                print(f"         {p['description'][:75]}")

    print(f"\n{'='*80}")
    print("\nSUMMARY BY ASPECT RATIO:")
    ratio_counts: dict[str, int] = defaultdict(int)
    for p in products:
        ratio_counts[p["aspect_ratio"]] += 1

    for ratio in sorted(ratio_counts.keys()):
        mark = "  [TARGET]" if ratio in TARGET_RATIOS else ""
        print(f"   {ratio:10s}  {ratio_counts[ratio]:3d} products{mark}")


# ── Main ──────────────────────────────────────────────────────────────────────

async def main() -> None:
    out_dir = Path(__file__).parent
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_file = out_dir / f"prodigi_catalog_{TARGET_COUNTRY}_{timestamp}.json"

    async with httpx.AsyncClient(base_url=BASE_URL, timeout=30.0) as client:
        # Step 1: discover all paper prints shipping to Germany
        products = await discover_catalog(client, TARGET_COUNTRY)

        if not products:
            print("\n[ERR] No products found. Check your API key and internet connection.")
            return

        # Step 2: enrich with quotes/pricing
        await enrich_with_quotes(client, products, TARGET_COUNTRY, TARGET_CURRENCY)

    # Step 3: save raw JSON
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump({"country": TARGET_COUNTRY, "products": products}, f, indent=2, ensure_ascii=False)
    print(f"\n[SAVED] Raw data saved to: {out_file}")

    # Step 4: print human-readable report
    print_report(products, TARGET_COUNTRY)

    # Step 5: print 4:5 ratio products specifically (the main target)
    ratio_45 = [p for p in products if p["aspect_ratio"] == "4:5"]
    print(f"\n=== PRODUCTS WITH 4:5 RATIO: {len(ratio_45)} found ===")
    for p in ratio_45:
        uc = p.get("unit_cost", {})
        sc = p.get("shipping_cost", {})
        print(f"  {p['sku']:42s} {p['width_in']:.0f}×{p['height_in']:.0f}\"  "
              f"cost:{uc.get('amount','?'):>7} {uc.get('currency','')}  "
              f"ship:{sc.get('amount','?')} {sc.get('currency','')}")
        print(f"    => {p['description']}")


if __name__ == "__main__":
    asyncio.run(main())
