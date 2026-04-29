from __future__ import annotations

from typing import Any

from src.integrations.prodigi.services.prodigi_storefront_read_model import (
    ProdigiStorefrontReadModelService,
)
from src.services.base import BaseService

CATEGORY_MEDIUM_MAP = {
    "paperPrintRolled": "paper",
    "paperPrintBoxFramed": "paper",
    "paperPrintClassicFramed": "paper",
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
        self.read_model = ProdigiStorefrontReadModelService(db)

    async def build_shop_summaries(
        self,
        artworks: list[Any],
        *,
        country_code: str,
    ) -> dict[int, dict[str, Any]]:
        normalized_country = (country_code or "").upper()
        if not artworks or len(normalized_country) != 2:
            return {}

        artwork_ids = [artwork.id for artwork in artworks]
        return await self.read_model.get_artwork_summaries(
            artwork_ids=artwork_ids,
            country_code=normalized_country,
        )

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


