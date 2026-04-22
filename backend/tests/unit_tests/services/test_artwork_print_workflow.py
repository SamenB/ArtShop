from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from PIL import Image

from src.schemas.artwork_print_assets import ArtworkPrintAsset
from src.services.artwork_print_workflow import ArtworkPrintWorkflowService


class FakeArtworkPrintAssetsRepository:
    def __init__(self, assets):
        self.assets = assets

    async def list_for_artwork(self, artwork_id: int):
        return [asset for asset in self.assets if asset.artwork_id == artwork_id]

    async def list_for_artwork_ids(self, artwork_ids: list[int]):
        return [asset for asset in self.assets if asset.artwork_id in artwork_ids]

    async def get_one_or_none(self, **filter_by):
        for asset in self.assets:
            if all(getattr(asset, key) == value for key, value in filter_by.items()):
                return asset
        return None

    async def delete_one(self, asset_id: int):
        self.assets = [asset for asset in self.assets if asset.id != asset_id]


class FakeDB:
    def __init__(self, assets):
        self.session = None
        self.artwork_print_assets = FakeArtworkPrintAssetsRepository(assets)


def make_artwork(*, workflow_config: dict | None = None):
    return SimpleNamespace(
        id=1,
        slug="test-artwork",
        title="Test Artwork",
        orientation="Vertical",
        print_aspect_ratio=SimpleNamespace(label="3:4"),
        print_workflow_config=workflow_config or {},
        print_source_metadata={"width_px": 5000, "height_px": 7000},
        print_quality_url="/static/print/master.tif",
        print_profile_overrides=None,
        has_paper_print=True,
        has_paper_print_limited=False,
        has_canvas_print=False,
        has_canvas_print_limited=False,
    )


def make_service(*, assets=None):
    service = ArtworkPrintWorkflowService(FakeDB(assets or []))
    service.storefront_repository = SimpleNamespace(
        get_active_bake=AsyncMock(
            return_value=SimpleNamespace(
                id=7,
                bake_key="active-bake",
                paper_material="hahnemuhle_german_etching",
                include_notice_level="show",
            )
        ),
        get_groups_for_bake_ratios=AsyncMock(
            return_value=[
                SimpleNamespace(
                    ratio_label="3:4",
                    category_id="paperPrintRolled",
                    sizes=[SimpleNamespace(slot_size_label="30x40 cm", available=True)],
                )
            ]
        ),
    )
    service.profile_service = SimpleNamespace(
        build_profile_bundle_for_artwork=lambda **kwargs: {
            "print_aspect_ratio": {"label": "3:4"},
            "source_quality_summary": {"status": "ready"},
            "effective_profiles": {
                "paperPrintRolled": {
                    "target_dpi": 300,
                    "wrap_margin_pct": 0.0,
                    "fixed_attributes": {},
                    "recommended_defaults": {},
                    "allowed_attributes": {},
                }
            },
        }
    )
    service._get_category_defs = lambda bake: [
        {
            "id": "paperPrintRolled",
            "label": "Paper Print Unframed",
            "medium": "paper",
            "material_label": "Hahnemuhle German Etching",
            "frame_label": "No frame",
        }
    ]
    return service


@pytest.mark.asyncio
async def test_bulk_readiness_blocks_when_required_prepared_asset_is_missing():
    artwork = make_artwork(
        workflow_config={
            "source_master_reviewed": True,
            "categories": {
                "paperPrintRolled": {
                    "enabled": True,
                    "reviewed": True,
                    "asset_strategy": "manual_white_border",
                    "provider_attributes": {},
                }
            },
        }
    )
    service = make_service()

    summaries = await service.build_bulk_readiness_summaries([artwork])

    summary = summaries[artwork.id]
    assert summary["status"] == "blocked"
    assert summary["blocking_category_count"] == 1
    assert summary["source_master_present"] is True


@pytest.mark.asyncio
async def test_get_workflow_marks_category_ready_when_reviewed_asset_is_uploaded():
    artwork = make_artwork(
        workflow_config={
            "source_master_reviewed": True,
            "categories": {
                "paperPrintRolled": {
                    "enabled": True,
                    "reviewed": True,
                    "asset_strategy": "manual_white_border",
                    "provider_attributes": {},
                }
            },
        }
    )
    asset = ArtworkPrintAsset(
        id=10,
        artwork_id=artwork.id,
        provider_key="prodigi",
        category_id="paperPrintRolled",
        asset_role="paper_border_ready",
        slot_size_label="30x40 cm",
        file_url="/static/print-prep/1/paper/test.png",
        file_name="test.png",
        file_ext=".png",
        mime_type="image/png",
        file_size_bytes=12345,
        checksum_sha256="abc123",
        file_metadata={"width_px": 4000, "height_px": 5000},
        note=None,
    )
    service = make_service(assets=[asset])
    service._get_artwork_orm = AsyncMock(return_value=artwork)

    payload = await service.get_workflow(artwork.id)

    assert payload["readiness_summary"]["status"] == "ready"
    assert payload["category_workflows"][0]["summary"]["status"] == "ready"
    assert payload["category_workflows"][0]["size_requirements"][0]["validation"]["status"] == "ready"


@pytest.mark.asyncio
async def test_shared_category_master_asset_covers_smaller_size_slots():
    artwork = make_artwork(
        workflow_config={
            "source_master_reviewed": True,
            "categories": {
                "paperPrintRolled": {
                    "enabled": True,
                    "reviewed": True,
                    "asset_strategy": "manual_white_border",
                    "provider_attributes": {},
                }
            },
        }
    )
    asset = ArtworkPrintAsset(
        id=11,
        artwork_id=artwork.id,
        provider_key="prodigi",
        category_id="paperPrintRolled",
        asset_role="paper_border_ready",
        slot_size_label=None,
        file_url="/static/print-prep/1/paper/master.png",
        file_name="master.png",
        file_ext=".png",
        mime_type="image/png",
        file_size_bytes=12345,
        checksum_sha256="def456",
        file_metadata={"width_px": 4000, "height_px": 5000},
        note=None,
    )
    service = make_service(assets=[asset])
    service._get_artwork_orm = AsyncMock(return_value=artwork)

    payload = await service.get_workflow(artwork.id)

    requirement = payload["category_workflows"][0]["size_requirements"][0]
    assert requirement["validation"]["status"] == "ready"
    assert requirement["asset_source"] == "category_master"
    assert payload["preparation_matrix"][0]["category_master_supported"] is True
    assert payload["preparation_matrix"][0]["covered_size_count"] == 1


@pytest.mark.asyncio
async def test_category_master_generates_smaller_derivatives(tmp_path):
    artwork = make_artwork(
        workflow_config={
            "source_master_reviewed": True,
            "categories": {
                "paperPrintRolled": {
                    "enabled": True,
                    "reviewed": True,
                    "asset_strategy": "manual_white_border",
                    "provider_attributes": {},
                }
            },
        }
    )
    master_path = tmp_path / "master.png"
    Image.new("RGB", (4000, 5000), color="white").save(master_path)
    asset = ArtworkPrintAsset(
        id=12,
        artwork_id=artwork.id,
        provider_key="prodigi",
        category_id="paperPrintRolled",
        asset_role="paper_border_ready",
        slot_size_label=None,
        file_url=f"/{master_path.as_posix()}",
        file_name="master.png",
        file_ext=".png",
        mime_type="image/png",
        file_size_bytes=12345,
        checksum_sha256="ghi789",
        file_metadata={"width_px": 4000, "height_px": 5000},
        note=None,
    )
    service = make_service(assets=[asset])
    service._get_artwork_orm = AsyncMock(return_value=artwork)
    captured_calls: list[dict] = []

    async def fake_upsert_prepared_asset(**kwargs):
        captured_calls.append(kwargs)
        return SimpleNamespace(**kwargs)

    service.upsert_prepared_asset = fake_upsert_prepared_asset

    generated = await service.generate_category_derivatives_from_master(
        artwork_id=artwork.id,
        category_id="paperPrintRolled",
        asset_role="paper_border_ready",
    )

    assert len(generated) == 1
    assert len(captured_calls) == 1
    assert captured_calls[0]["slot_size_label"] == "30x40 cm"
    assert captured_calls[0]["file_ext"] == ".png"
    assert captured_calls[0]["mime_type"] == "image/png"
