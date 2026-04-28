import json
import logging
from dataclasses import asdict, dataclass

from src.init import redis_manager
from src.integrations.prodigi.connectors.client import PAPER_SKU_PREFIXES, ProdigiClient

log = logging.getLogger(__name__)

CANVAS_SKU_PREFIXES = ["GLOBAL-CAN", "GLOBAL-FRA-CAN"]
FRAMED_PAPER_PREFIXES = ["GLOBAL-CFP", "GLOBAL-BFP", "GLOBAL-EMA"]

HUB_FAMILIES = {
    "HPR_ROLLED": ["GLOBAL-HPR"],
    "HPR_BOX_FRAME": ["FRA-BOX-HPR-MOUNT1-ACRY", "UK-BFA", "GLOBAL-BFA"],
    "CANVAS_ROLLED": ["GLOBAL-PC", "GLOBAL-CC", "GLOBAL-PRC", "GLOBAL-CRC", "UK-PC", "US-PC"],
    "CANVAS_STRETCHED": ["GLOBAL-CAN"],
    "CANVAS_FLOATING": ["GLOBAL-FRA-CAN"]
}


@dataclass
class CachedProduct:
    sku: str
    description: str
    width_in: float
    height_in: float
    width_cm: float
    height_cm: float
    aspect_ratio: str
    attributes: dict
    unit_cost_eur: float | None
    shipping_std_eur: float | None

def ratios_match(product_ratio: str, target_ratio: str, tolerance: float = 0.02) -> bool:
    if product_ratio == "unknown" or target_ratio == "unknown":
        return False
    pw, ph = map(int, product_ratio.split(":"))
    tw, th = map(int, target_ratio.split(":"))
    return abs(pw / ph - tw / th) < tolerance


class ProdigiCatalogService:
    def __init__(self):
        self.redis = redis_manager

    async def get_options(self, country: str, aspect_ratio: str):
        """
        Gathers configured print options based on prodigi discovery for a given country and ratio.
        """
        all_products = []
        for prefix in PAPER_SKU_PREFIXES + CANVAS_SKU_PREFIXES + FRAMED_PAPER_PREFIXES:
            products = await self._get_cached_family(country, prefix)
            if products is None:
                products = await self.refresh_family_cache(country, prefix)

            # Filter by aspect ratio using the tolerance
            matched = [p for p in products if ratios_match(p.aspect_ratio, aspect_ratio)]
            all_products.extend(matched)

        return self._group_products(all_products)

    async def _get_cached_family(self, country: str, prefix: str) -> list[CachedProduct] | None:
        key = f"prodigi:catalog:{country}:{prefix}"
        data = await self.redis.get(key)
        if not data:
            return None
        try:
            items = json.loads(data)
            return [CachedProduct(**item) for item in items]
        except Exception as e:
            log.warning(f"Failed to load cache for {key}: {e}")
            return None

    async def refresh_family_cache(self, country: str, prefix: str) -> list[CachedProduct]:
        """Call Prodigi API → get products, get quotes for wholesale & shipping, write to Redis."""
        key = f"prodigi:catalog:{country}:{prefix}"
        log.info(f"Refreshing catalog cache for {key}...")

        async with ProdigiClient() as client:
            # We use the generic discover_paper_prints which can discover canvas too if prefixes override
            details_list = await client.discover_paper_prints(
                country_code=country,
                sku_prefixes=[prefix],
                max_concurrent=15
            )

            # Note: For each item we could fetch quote to get `unit_cost_eur` and `shipping_std_eur`.
            # We batch the quote calls to save time.
            cached_products = []

            for d in details_list:
                quote = await client.get_quote(d.sku, country, "EUR")
                costs = self._parse_quote_for_std(quote)

                # Try to parse cm from description: "Hahnemühle Photo Rag, 40x50 cm / 16x20\""
                width_cm, height_cm = 0.0, 0.0
                if " cm" in d.description:
                    try:
                        cm_part = d.description.split(" cm")[0].split(",")[-1].strip()
                        w, h = cm_part.split("x")
                        width_cm, height_cm = float(w), float(h)
                    except ValueError:
                        # Fallback mathematically (1 inch = 2.54 cm)
                        width_cm, height_cm = round(d.width_in * 2.54, 1), round(d.height_in * 2.54, 1)
                else:
                    width_cm, height_cm = round(d.width_in * 2.54, 1), round(d.height_in * 2.54, 1)

                cp = CachedProduct(
                    sku=d.sku,
                    description=d.description,
                    width_in=d.width_in,
                    height_in=d.height_in,
                    width_cm=width_cm,
                    height_cm=height_cm,
                    aspect_ratio=d.aspect_ratio,
                    attributes=d.attributes,
                    unit_cost_eur=costs.get("product_cost"),
                    shipping_std_eur=costs.get("shipping_cost")
                )
                cached_products.append(cp)

            await self.redis.set(key, json.dumps([asdict(p) for p in cached_products]), expire=86400)
            return cached_products

    def _parse_quote_for_std(self, quote: dict) -> dict[str, float | None]:
        if "quotes" not in quote:
            return {"product_cost": None, "shipping_cost": None}

        std_quote = next((q for q in quote["quotes"] if q.get("shipmentMethod") == "Standard"), None)
        if not std_quote and quote["quotes"]:
            std_quote = quote["quotes"][0]

        if std_quote:
            # Use unitCost which is the correct field for /quotes items
            prod_cost = sum(float(i.get("unitCost", {}).get("amount", 0)) for i in std_quote.get("items", []))
            # Use costSummary.shipping as it's the standard for /quotes
            ship_cost = float(std_quote.get("costSummary", {}).get("shipping", {}).get("amount", 0))
            return {"product_cost": round(prod_cost, 2), "shipping_cost": round(ship_cost, 2)}

        return {"product_cost": None, "shipping_cost": None}

    async def get_quote_cached(self, sku: str, country: str, currency: str = "EUR", attributes: dict | None = None) -> dict | None:
        key = f"prodigi:quote:{sku}:{country}:{currency}"
        if attributes:
             # Sort attributes for consistent cache key
             attr_str = "-".join([f"{k}:{v}" for k, v in sorted(attributes.items())])
             key += f":{attr_str}"

        data = await self.redis.get(key)
        if data:
            return json.loads(data)

        async with ProdigiClient() as client:
            quote = await client.get_quote(sku, country, currency, attributes)
            if quote and quote.get("outcome") == "Created":
                await self.redis.set(key, json.dumps(quote), expire=86400)
                return quote
        return None

    async def get_detailed_options(self, country: str, aspect_ratio: str, family_input: str):
        """
        Diagnostic probe: returns raw-ish catalog data with ALL shipping methods and transit times.
        Bypasses standard grouping for deeper inspection.
        """
        log.info(f"Diagnostic probe: country={country}, ratio={aspect_ratio}, family={family_input}")

        # Resolve family group if possible
        prefixes = HUB_FAMILIES.get(family_input.upper(), [family_input])

        import asyncio
        async with ProdigiClient() as client:
            discovery = await client.discover_paper_prints(
                country_code=country,
                sku_prefixes=prefixes,
                max_concurrent=15
            )

            # Filter by ratio
            matched = [d for d in discovery if ratios_match(d.aspect_ratio, aspect_ratio)]

            # STRICT FILTER: Ensure we only return items matching requested prefixes
            matched = [d for d in matched if any(d.sku.upper().startswith(p.upper()) for p in prefixes)]

            # Global limit for concurrent quotes across all variants to avoid rate limiting
            quote_semaphore = asyncio.Semaphore(20)

            async def get_variant_probe_details(sku_details, variant):
                async with quote_semaphore:
                    try:
                        quote = await client.get_quote(sku_details.sku, country, "EUR", attributes=variant.attributes)
                    except Exception as e:
                        return {
                            "sku": sku_details.sku,
                            "description": sku_details.description,
                            "aspect_ratio": sku_details.aspect_ratio,
                            "width_in": sku_details.width_in,
                            "height_in": sku_details.height_in,
                            "applied_attributes": variant.attributes,
                            "quote_outcome": "Error",
                            "quote_issues": [{"description": str(e)}],
                            "shipping_tiers": [],
                            "raw_details": asdict(sku_details),
                            "raw_quote": {"error": str(e)}
                        }

                    # Extract all shipping tiers
                    shipping_tiers = []
                    for q in quote.get("quotes", []):
                        prod_cost = sum(float(i.get("unitCost", {}).get("amount", 0)) for i in q.get("items", []))
                        ship_summary = q.get("costSummary", {}).get("shipping", {})
                        ship_cost = float(ship_summary.get("amount", 0))

                        shipping_tiers.append({
                            "method": q.get("shipmentMethod") or "Standard",
                            "wholesale_cost_eur": round(prod_cost, 2),
                            "shipping_cost_eur": round(ship_cost, 2),
                            "total_wholesale_eur": round(prod_cost + ship_cost, 2),
                            "delivery_estimate": q.get("deliveryEstimate", "N/A"),
                            "issues": q.get("issues", [])
                        })

                    if not quote:
                        return {
                            "sku": sku_details.sku,
                            "description": sku_details.description,
                            "aspect_ratio": sku_details.aspect_ratio,
                            "width_in": sku_details.width_in,
                            "height_in": sku_details.height_in,
                            "applied_attributes": variant.attributes,
                            "quote_outcome": "Failed",
                            "quote_issues": ["API returned None for quote"],
                            "shipping_tiers": [],
                            "is_ideal_match": False,
                            "raw_details": asdict(sku_details),
                            "raw_quote": None
                        }

                    return {
                        "sku": sku_details.sku,
                        "description": sku_details.description,
                        "aspect_ratio": sku_details.aspect_ratio,
                        "width_in": sku_details.width_in,
                        "height_in": sku_details.height_in,
                        "applied_attributes": variant.attributes,
                        "quote_outcome": quote.get("outcome"),
                        "quote_issues": quote.get("issues", []),
                        "shipping_tiers": shipping_tiers,
                        "is_ideal_match": (
                            variant.attributes.get("paperType") == "HPR" and (
                                # Can be a Box frame or a Premium Framed Print variant
                                variant.attributes.get("frame") == "Box" or
                                "1.4mm" in str(variant.attributes.get("mount", ""))
                            ) and (
                                # Support multiple glaze naming conventions
                                "Acrylic" in str(variant.attributes.get("glaze", "")) or
                                "Perspex" in str(variant.attributes.get("glaze", ""))
                            )
                        ),
                        "raw_details": asdict(sku_details),
                        "raw_quote": quote
                    }

            # Flatten variants and fetch quotes
            tasks = []
            for d in matched:
                for v in d.variants:
                    tasks.append(get_variant_probe_details(d, v))

            results = await asyncio.gather(*tasks)
            # Sort by SKU then by attributes for clean UI
            sorted_results = sorted(list(results), key=lambda x: (x["sku"], str(x["applied_attributes"])))
            return sorted_results

    def _group_products(self, products: list[CachedProduct]) -> dict:
        # Group products for the Phase 2 options response mapping
        # This will be used heavily by api/print_options.py
        return {"products": products} # Return raw for now; api layer will format it
