from __future__ import annotations

import asyncio
import json
from collections import Counter, defaultdict
from statistics import median

from sqlalchemy import text

from src.database import new_session
from src.services.prodigi_shipping_support_policy import (
    ProdigiShippingSupportPolicyService,
)


def percentile(values: list[float], ratio: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    index = min(len(ordered) - 1, round((len(ordered) - 1) * ratio))
    return ordered[index]


async def main() -> None:
    policy = ProdigiShippingSupportPolicyService()

    async with new_session() as session:
        bake_id = (
            await session.execute(
                text(
                    """
                    SELECT id
                    FROM prodigi_storefront_bakes
                    WHERE is_active = true
                    ORDER BY id DESC
                    LIMIT 1
                    """
                )
            )
        ).scalar_one()

        rows = await session.execute(
            text(
                """
                SELECT
                    g.category_id,
                    g.destination_country,
                    s.slot_size_label,
                    s.shipping_profiles
                FROM prodigi_storefront_offer_groups g
                JOIN prodigi_storefront_offer_sizes s ON s.offer_group_id = g.id
                WHERE g.bake_id = :bake_id
                """
            ),
            {"bake_id": bake_id},
        )

        by_tier_prices: dict[str, list[float]] = defaultdict(list)
        support_statuses: Counter[str] = Counter()
        support_tiers: Counter[str] = Counter()
        total_sizes = 0

        for row in rows.mappings():
            profiles = row["shipping_profiles"] or []
            if isinstance(profiles, str):
                profiles = json.loads(profiles)

            if profiles:
                total_sizes += 1

            for profile in profiles:
                tier = profile.get("tier")
                shipping_price = profile.get("shipping_price")
                if tier and shipping_price is not None:
                    by_tier_prices[tier].append(float(shipping_price))

            support = policy.evaluate_size(profiles)
            support_statuses[support["status"]] += 1
            if support["chosen_tier"]:
                support_tiers[support["chosen_tier"]] += 1

    print("=== Prodigi Shipping Analysis ===")
    print("Policy:", policy.serialize_policy_meta())
    print(f"Sizes with shipping profiles: {total_sizes}")
    print()

    print("Tier price distribution:")
    for tier in sorted(by_tier_prices):
        values = by_tier_prices[tier]
        print(
            f"- {tier}: count={len(values)} "
            f"p50={median(values):.2f} "
            f"p75={percentile(values, 0.75):.2f} "
            f"p90={percentile(values, 0.90):.2f} "
            f"p95={percentile(values, 0.95):.2f} "
            f"max={max(values):.2f}"
        )
    print()

    print("Free-shipping support status:")
    for status, count in sorted(support_statuses.items()):
        share = count / total_sizes * 100 if total_sizes else 0
        print(f"- {status}: {count} ({share:.2f}%)")
    print()

    print("Chosen subsidized tier:")
    for tier, count in sorted(support_tiers.items()):
        share = count / total_sizes * 100 if total_sizes else 0
        print(f"- {tier}: {count} ({share:.2f}%)")


if __name__ == "__main__":
    asyncio.run(main())
