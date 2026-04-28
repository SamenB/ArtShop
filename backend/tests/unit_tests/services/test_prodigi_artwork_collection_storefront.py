from decimal import Decimal
from types import SimpleNamespace

import pytest

from src.integrations.prodigi.services.prodigi_artwork_collection_storefront import (
    ProdigiArtworkCollectionStorefrontService,
)


class FakeStorefrontRepository:
    async def get_active_bake(self):
        return SimpleNamespace(id=11)

    async def get_materialized_summaries(
        self,
        *,
        bake_id: int,
        artwork_ids: list[int],
        country_code: str,
    ):
        assert bake_id == 11
        assert artwork_ids == [89, 90]
        assert country_code == "DE"
        return []

    async def get_country_groups_for_ratios(self, bake_id: int, destination_country: str, ratio_labels: list[str]):
        assert bake_id == 11
        assert destination_country == "DE"
        assert ratio_labels == ["4:5"]
        return [
            SimpleNamespace(
                ratio_label="4:5",
                destination_country_name="Germany",
                category_id="paperPrintRolled",
                category_label="Paper Print Unframed",
                material_label="Hahnemuhle German Etching",
                frame_label="No frame",
                sizes=[
                    SimpleNamespace(
                        available=True,
                        size_label="40x50",
                        slot_size_label="40x50",
                        product_price=Decimal("25.00"),
                        shipping_profiles=[
                            {"tier": "standard", "shipping_price": 10.0},
                        ],
                    ),
                    SimpleNamespace(
                        available=True,
                        size_label="60x75",
                        slot_size_label="60x75",
                        product_price=Decimal("35.00"),
                        shipping_profiles=[
                            {"tier": "standard", "shipping_price": 40.0},
                        ],
                    ),
                ],
            ),
            SimpleNamespace(
                ratio_label="4:5",
                destination_country_name="Germany",
                category_id="canvasStretched",
                category_label="Canvas Stretched",
                material_label="Standard Canvas",
                frame_label="38mm stretched canvas",
                sizes=[
                    SimpleNamespace(
                        available=True,
                        size_label="40x50",
                        slot_size_label="40x50",
                        product_price=Decimal("45.00"),
                        shipping_profiles=[
                            {"tier": "standard", "shipping_price": 20.0},
                        ],
                    ),
                ],
            ),
        ]


@pytest.mark.asyncio
async def test_build_shop_summaries_returns_country_ready_starting_prices():
    artworks = [
        SimpleNamespace(
            id=89,
            has_paper_print=True,
            has_paper_print_limited=False,
            has_canvas_print=True,
            has_canvas_print_limited=False,
            print_aspect_ratio=SimpleNamespace(id=1, label="4:5", description="Portrait"),
        ),
        SimpleNamespace(
            id=90,
            has_paper_print=False,
            has_paper_print_limited=False,
            has_canvas_print=True,
            has_canvas_print_limited=False,
            print_aspect_ratio=SimpleNamespace(id=1, label="4:5", description="Portrait"),
        ),
    ]

    service = ProdigiArtworkCollectionStorefrontService(SimpleNamespace(session=None))
    service.repository = FakeStorefrontRepository()

    summaries = await service.build_shop_summaries(artworks, country_code="de")

    assert summaries[89]["print_country_supported"] is True
    assert summaries[89]["country_code"] == "DE"
    assert summaries[89]["country_name"] == "Germany"
    assert summaries[89]["min_print_price"] == 75.0
    assert summaries[89]["default_medium"] == "paper"
    assert summaries[89]["mediums"]["paper"]["available"] is True
    assert summaries[89]["mediums"]["paper"]["starting_price"] == 75.0
    assert summaries[89]["mediums"]["canvas"]["starting_price"] == 164.0
    assert summaries[89]["mediums"]["paper"]["cards"][0]["starting_size_label"] == "40x50"

    assert summaries[90]["mediums"]["paper"]["available"] is False
    assert summaries[90]["mediums"]["canvas"]["available"] is True
    assert summaries[90]["min_print_price"] == 164.0


class FakeMaterializedSummaryRepository:
    async def get_active_bake(self):
        return SimpleNamespace(id=11)

    async def get_materialized_summaries(
        self,
        *,
        bake_id: int,
        artwork_ids: list[int],
        country_code: str,
    ):
        assert bake_id == 11
        assert artwork_ids == [89]
        assert country_code == "DE"
        return [
            SimpleNamespace(
                artwork_id=89,
                summary={
                    "country_code": "DE",
                    "country_name": "Germany",
                    "print_country_supported": True,
                    "min_print_price": 17.5,
                    "default_medium": "canvas",
                    "mediums": {
                        "paper": {
                            "available": False,
                            "starting_price": None,
                            "starting_size_label": None,
                            "card_count": 0,
                            "cards": [],
                        },
                        "canvas": {
                            "available": True,
                            "starting_price": 17.5,
                            "starting_size_label": "20x25",
                            "card_count": 4,
                            "cards": [],
                        },
                    },
                },
            )
        ]


@pytest.mark.asyncio
async def test_build_shop_summaries_prefers_materialized_rows():
    artworks = [
        SimpleNamespace(
            id=89,
            has_paper_print=False,
            has_paper_print_limited=False,
            has_canvas_print=True,
            has_canvas_print_limited=False,
            print_aspect_ratio=SimpleNamespace(id=1, label="4:5", description="Portrait"),
        )
    ]

    service = ProdigiArtworkCollectionStorefrontService(SimpleNamespace(session=None))
    service.repository = FakeMaterializedSummaryRepository()

    summaries = await service.build_shop_summaries(artworks, country_code="de")

    assert summaries[89]["country_name"] == "Germany"
    assert summaries[89]["min_print_price"] == 17.5
    assert summaries[89]["default_medium"] == "canvas"
