from __future__ import annotations

import asyncio
import json
import statistics
from collections import defaultdict
from decimal import Decimal

import asyncpg

from src.config import settings
from src.services.prodigi_business_policy import ProdigiBusinessPolicyService
from src.services.prodigi_market_priority import get_market_priority
from src.services.prodigi_shipping_support_policy import (
    ProdigiShippingSupportPolicyService,
)


async def main() -> None:
    conn = await asyncpg.connect(
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        database=settings.POSTGRES_DB,
        host=settings.DB_HOST,
        port=settings.DB_PORT,
    )
    try:
        rows = await conn.fetch(
            """
            SELECT
                g.destination_country,
                g.category_id,
                s.product_price,
                s.shipping_profiles
            FROM prodigi_storefront_offer_sizes s
            JOIN prodigi_storefront_offer_groups g ON g.id = s.offer_group_id
            JOIN prodigi_storefront_bakes b ON b.id = g.bake_id
            WHERE b.is_active = TRUE
              AND s.available = TRUE
            """
        )
    finally:
        await conn.close()

    shipping_policy = ProdigiShippingSupportPolicyService()
    business_policy = ProdigiBusinessPolicyService()

    category_stats: dict[str, dict[str, list[float] | int]] = defaultdict(
        lambda: {
            "product_prices": [],
            "covered_shipping": [],
            "included_product_prices": [],
            "included_shipping": [],
            "pass_through_shipping": [],
            "hidden_shipping": [],
            "included_count": 0,
            "pass_through_count": 0,
            "hidden_count": 0,
            "total_count": 0,
        }
    )

    for row in rows:
        category_id = row["category_id"]
        market_segment = get_market_priority(row["destination_country"])["segment"]
        shipping_profiles = row["shipping_profiles"] or []
        if isinstance(shipping_profiles, str):
            shipping_profiles = json.loads(shipping_profiles)

        shipping_support = shipping_policy.evaluate_size(shipping_profiles)
        product_price = float(row["product_price"]) if row["product_price"] is not None else None
        decision = business_policy.evaluate_print_business_rules(
            category_id=category_id,
            market_segment=market_segment,
            product_price=product_price,
            shipping_support=shipping_support,
        )

        bucket = category_stats[category_id]
        bucket["total_count"] += 1
        if product_price is not None:
            bucket["product_prices"].append(product_price)

        if shipping_support.get("status") == "covered" and shipping_support.get("chosen_shipping_price") is not None:
            bucket["covered_shipping"].append(float(shipping_support["chosen_shipping_price"]))

        shipping_mode = decision["shipping_mode"]
        if shipping_mode == "included":
            bucket["included_count"] += 1
            if product_price is not None:
                bucket["included_product_prices"].append(product_price)
            if decision["shipping_price_for_margin"] is not None:
                bucket["included_shipping"].append(float(decision["shipping_price_for_margin"]))
        elif shipping_mode == "pass_through":
            bucket["pass_through_count"] += 1
            if decision["customer_shipping_price"] is not None:
                bucket["pass_through_shipping"].append(float(decision["customer_shipping_price"]))
        else:
            bucket["hidden_count"] += 1
            hidden_shipping = shipping_support.get("cheapest_shipping_price")
            if hidden_shipping is not None:
                bucket["hidden_shipping"].append(float(hidden_shipping))

    print("ArtShop print business model analysis")
    print("====================================")
    print()
    print("Original art policy")
    print(business_policy.build_original_art_policy())
    print()
    print(
        "Unframed delivery subsidy budget:",
        business_policy.UNFRAMED_DELIVERY_SUBSIDY_BUDGET,
    )
    print("Reference multiplier check: x3")
    print()

    for category_id in [
        "paperPrintRolled",
        "paperPrintBoxFramed",
        "canvasRolled",
        "canvasStretched",
        "canvasClassicFrame",
        "canvasFloatingFrame",
    ]:
        stats = category_stats[category_id]
        total_count = int(stats["total_count"])
        if total_count == 0:
            continue

        avg_product = _avg(stats["product_prices"])
        avg_included_ship = _avg(stats["included_shipping"])
        included_ratio = (
            avg_included_ship / avg_product
            if avg_product is not None and avg_included_ship is not None and avg_product > 0
            else None
        )

        print(business_policy.describe_category_policy(category_id))
        print(
            {
                "total_sizes": total_count,
                "included_count": int(stats["included_count"]),
                "pass_through_count": int(stats["pass_through_count"]),
                "hidden_count": int(stats["hidden_count"]),
                "avg_product_price": avg_product,
                "avg_covered_shipping": _avg(stats["covered_shipping"]),
                "avg_included_shipping": avg_included_ship,
                "pass_through_median_shipping": _median(stats["pass_through_shipping"]),
                "hidden_median_shipping": _median(stats["hidden_shipping"]),
                "x3_gross_margin_on_included": (
                    _gross_margin(
                        multiplier=3.0,
                        avg_product_price=avg_product,
                        avg_shipping_absorb=avg_included_ship,
                    )
                    if avg_product is not None and avg_included_ship is not None
                    else None
                ),
                "x_for_45_margin_on_included": (
                    _required_multiplier(included_ratio, 0.45)
                    if included_ratio is not None
                    else None
                ),
                "x_for_50_margin_on_included": (
                    _required_multiplier(included_ratio, 0.50)
                    if included_ratio is not None
                    else None
                ),
            }
        )
        print()


def _avg(values: list[float] | list[Decimal]) -> float | None:
    if not values:
        return None
    return round(float(statistics.mean(values)), 2)


def _median(values: list[float] | list[Decimal]) -> float | None:
    if not values:
        return None
    return round(float(statistics.median(values)), 2)


def _required_multiplier(shipping_ratio: float, target_margin: float) -> float:
    return round((1 + shipping_ratio) / (1 - target_margin), 2)


def _gross_margin(
    *,
    multiplier: float,
    avg_product_price: float,
    avg_shipping_absorb: float,
) -> float:
    revenue = avg_product_price * multiplier
    gross_profit = revenue - avg_product_price - avg_shipping_absorb
    return round(gross_profit / revenue, 4)


if __name__ == "__main__":
    asyncio.run(main())
