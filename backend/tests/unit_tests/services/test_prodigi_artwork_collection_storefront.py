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


@pytest.mark.asyncio
async def test_build_shop_summaries_does_not_rebuild_missing_materialized_rows():
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
    service.read_model.repository = FakeStorefrontRepository()

    summaries = await service.build_shop_summaries(artworks, country_code="de")

    assert summaries == {}


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
    service.read_model.repository = FakeMaterializedSummaryRepository()

    summaries = await service.build_shop_summaries(artworks, country_code="de")

    assert summaries[89]["country_name"] == "Germany"
    assert summaries[89]["min_print_price"] == 17.5
    assert summaries[89]["default_medium"] == "canvas"
