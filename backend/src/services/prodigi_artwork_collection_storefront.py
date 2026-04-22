from __future__ import annotations

from collections import defaultdict
from typing import Any

from src.repositories.prodigi_storefront import ProdigiStorefrontRepository
from src.services.base import BaseService
from src.services.prodigi_business_policy import ProdigiBusinessPolicyService
from src.services.prodigi_market_priority import get_market_priority
from src.services.prodigi_shipping_support_policy import (
    ProdigiShippingSupportPolicyService,
)

CATEGORY_MEDIUM_MAP = {
    "paperPrintRolled": "paper",
    "paperPrintBoxFramed": "paper",
    "canvasRolled": "canvas",
    "canvasStretched": "canvas",
    "canvasClassicFrame": "canvas",
    "canvasFloatingFrame": "canvas",
}


class ProdigiArtworkCollectionStorefrontService(BaseService):
    """
    Bulk storefront read-model for the shop/gallery collection feed.

    The goal here is different from the single-artwork storefront endpoint:
    - one query returns many artworks,
    - one grouped lookup resolves the baked storefront slice for one country,
    - each artwork receives a compact, render-ready storefront summary.

    This keeps the shop page on a single bulk payload instead of triggering
    N separate storefront requests after the first render.
    """

    def __init__(self, db):
        super().__init__(db)
        self.repository = ProdigiStorefrontRepository(db.session)
        self.shipping_support_policy = ProdigiShippingSupportPolicyService()
        self.business_policy = ProdigiBusinessPolicyService()

    async def build_shop_summaries(
        self,
        artworks: list[Any],
        *,
        country_code: str,
    ) -> dict[int, dict[str, Any]]:
        normalized_country = (country_code or "").upper()
        if not artworks or len(normalized_country) != 2:
            return {}

        active_bake = await self.repository.get_active_bake()
        if active_bake is None:
            return {}

        artwork_ids = [artwork.id for artwork in artworks]
        materialized_rows = await self.repository.get_materialized_summaries(
            bake_id=active_bake.id,
            artwork_ids=artwork_ids,
            country_code=normalized_country,
        )
        summaries: dict[int, dict[str, Any]] = {
            row.artwork_id: dict(row.summary or {})
            for row in materialized_rows
        }
        missing_artworks = [artwork for artwork in artworks if artwork.id not in summaries]
        if not missing_artworks:
            return summaries

        ratio_labels = sorted(
            {
                artwork.print_aspect_ratio.label
                for artwork in missing_artworks
                if getattr(artwork, "print_aspect_ratio", None)
                and getattr(artwork.print_aspect_ratio, "label", None)
            }
        )
        if not ratio_labels:
            return summaries

        groups = await self.repository.get_country_groups_for_ratios(
            active_bake.id,
            normalized_country,
            ratio_labels,
        )
        groups_by_ratio: dict[str, list[Any]] = defaultdict(list)
        for group in groups:
            groups_by_ratio[group.ratio_label].append(group)

        for artwork in missing_artworks:
            ratio = getattr(artwork, "print_aspect_ratio", None)
            ratio_label = getattr(ratio, "label", None)
            summary = self._build_empty_summary(country_code=normalized_country)
            if ratio_label:
                summary["print_aspect_ratio"] = {
                    "id": getattr(ratio, "id", None),
                    "label": ratio_label,
                    "description": getattr(ratio, "description", None),
                }
                summary = self._build_artwork_summary(
                    artwork=artwork,
                    country_code=normalized_country,
                    groups=groups_by_ratio.get(ratio_label, []),
                    base_summary=summary,
                )
            summaries[artwork.id] = summary
        return summaries

    @staticmethod
    def build_summary_from_storefront_payload(payload: dict[str, Any]) -> dict[str, Any]:
        country_code = (payload.get("country_code") or "").upper()
        summary = {
            "country_code": country_code,
            "country_name": payload.get("country_name"),
            "print_country_supported": bool(payload.get("country_supported")),
            "print_aspect_ratio": payload.get("print_aspect_ratio"),
            "min_print_price": None,
            "default_medium": None,
            "mediums": {
                "paper": {
                    "available": False,
                    "starting_price": None,
                    "starting_size_label": None,
                    "card_count": 0,
                    "cards": [],
                },
                "canvas": {
                    "available": False,
                    "starting_price": None,
                    "starting_size_label": None,
                    "card_count": 0,
                    "cards": [],
                },
            },
        }

        medium_candidates: list[tuple[str, float]] = []
        for medium_name in ("paper", "canvas"):
            medium_payload = (payload.get("mediums") or {}).get(medium_name) or {}
            cards = medium_payload.get("cards") or []
            summary_cards: list[dict[str, Any]] = []
            for card in cards:
                priced_sizes = [
                    size
                    for size in (card.get("size_options") or [])
                    if size.get("customer_total_price") is not None
                ]
                if not priced_sizes:
                    continue
                priced_sizes.sort(
                    key=lambda item: (
                        float(item["customer_total_price"]),
                        item.get("size_label") or item.get("slot_size_label") or "",
                    )
                )
                starting = priced_sizes[0]
                summary_cards.append(
                    {
                        "category_id": card.get("category_id"),
                        "label": card.get("label"),
                        "material_label": card.get("material_label"),
                        "frame_label": card.get("frame_label"),
                        "starting_price": round(float(starting["customer_total_price"]), 2),
                        "starting_size_label": starting.get("size_label")
                        or starting.get("slot_size_label"),
                        "available_size_count": len(priced_sizes),
                    }
                )
            summary_cards.sort(
                key=lambda item: (
                    item["starting_price"],
                    item["label"] or "",
                    item["category_id"] or "",
                )
            )
            if not summary_cards:
                continue

            medium_summary = summary["mediums"][medium_name]
            medium_summary["available"] = True
            medium_summary["starting_price"] = summary_cards[0]["starting_price"]
            medium_summary["starting_size_label"] = summary_cards[0]["starting_size_label"]
            medium_summary["card_count"] = len(summary_cards)
            medium_summary["cards"] = summary_cards
            medium_candidates.append((medium_name, summary_cards[0]["starting_price"]))

        if medium_candidates:
            medium_candidates.sort(key=lambda item: (item[1], 0 if item[0] == "paper" else 1))
            summary["min_print_price"] = medium_candidates[0][1]
            summary["default_medium"] = medium_candidates[0][0]
            summary["print_country_supported"] = True

        return summary

    def _build_artwork_summary(
        self,
        *,
        artwork: Any,
        country_code: str,
        groups: list[Any],
        base_summary: dict[str, Any],
    ) -> dict[str, Any]:
        market_segment = get_market_priority(country_code)["segment"]
        medium_availability = {
            "paper": bool(
                getattr(artwork, "has_paper_print", False)
                or getattr(artwork, "has_paper_print_limited", False)
            ),
            "canvas": bool(
                getattr(artwork, "has_canvas_print", False)
                or getattr(artwork, "has_canvas_print_limited", False)
            ),
        }
        medium_cards: dict[str, list[dict[str, Any]]] = {"paper": [], "canvas": []}

        country_name = None
        for group in groups:
            medium = CATEGORY_MEDIUM_MAP.get(group.category_id)
            if medium is None or not medium_availability[medium]:
                continue
            country_name = country_name or group.destination_country_name or country_code

            cheapest_price = None
            cheapest_size_label = None
            visible_size_count = 0

            for size in group.sizes:
                if not size.available:
                    continue

                shipping_support = self.shipping_support_policy.evaluate_size(
                    size.shipping_profiles or []
                )
                business_policy = self.business_policy.evaluate_print_business_rules(
                    category_id=group.category_id,
                    market_segment=market_segment,
                    product_price=float(size.product_price) if size.product_price is not None else None,
                    shipping_support=shipping_support,
                )
                final_price = self._build_customer_total_price(
                    retail_product_price=business_policy.get("retail_product_price"),
                    customer_shipping_price=business_policy.get("customer_shipping_price"),
                    shipping_mode=business_policy.get("shipping_mode"),
                )
                if final_price is None:
                    continue

                visible_size_count += 1
                if cheapest_price is None or final_price < cheapest_price:
                    cheapest_price = final_price
                    cheapest_size_label = size.size_label or size.slot_size_label

            if cheapest_price is None:
                continue

            medium_cards[medium].append(
                {
                    "category_id": group.category_id,
                    "label": group.category_label,
                    "material_label": group.material_label,
                    "frame_label": group.frame_label,
                    "starting_price": cheapest_price,
                    "starting_size_label": cheapest_size_label,
                    "available_size_count": visible_size_count,
                }
            )

        for medium, cards in medium_cards.items():
            cards.sort(
                key=lambda item: (
                    item["starting_price"],
                    item["label"],
                    item["category_id"],
                )
            )
            if not cards:
                continue
            base_summary["mediums"][medium] = {
                "available": True,
                "starting_price": cards[0]["starting_price"],
                "starting_size_label": cards[0]["starting_size_label"],
                "card_count": len(cards),
                "cards": cards,
            }

        all_starting_prices = [
            medium["starting_price"]
            for medium in base_summary["mediums"].values()
            if medium["starting_price"] is not None
        ]
        base_summary["country_name"] = country_name
        base_summary["print_country_supported"] = bool(all_starting_prices)
        base_summary["min_print_price"] = min(all_starting_prices) if all_starting_prices else None
        base_summary["default_medium"] = (
            "paper"
            if base_summary["mediums"]["paper"]["available"]
            else "canvas"
            if base_summary["mediums"]["canvas"]["available"]
            else None
        )
        return base_summary

    def _build_empty_summary(self, *, country_code: str) -> dict[str, Any]:
        return {
            "country_code": country_code,
            "country_name": None,
            "print_country_supported": False,
            "print_aspect_ratio": None,
            "min_print_price": None,
            "default_medium": None,
            "mediums": {
                "paper": {
                    "available": False,
                    "starting_price": None,
                    "starting_size_label": None,
                    "card_count": 0,
                    "cards": [],
                },
                "canvas": {
                    "available": False,
                    "starting_price": None,
                    "starting_size_label": None,
                    "card_count": 0,
                    "cards": [],
                },
            },
        }

    def _build_customer_total_price(
        self,
        *,
        retail_product_price: Any,
        customer_shipping_price: Any,
        shipping_mode: str | None,
    ) -> float | None:
        if retail_product_price is None:
            return None

        retail_value = round(float(retail_product_price), 2)
        if shipping_mode == "included":
            return retail_value
        if shipping_mode == "pass_through":
            return round(retail_value + float(customer_shipping_price or 0), 2)
        return None
