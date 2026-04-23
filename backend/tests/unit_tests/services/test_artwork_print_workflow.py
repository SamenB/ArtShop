from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from PIL import Image

from src.schemas.artwork_print_assets import ArtworkPrintAsset
from src.services.artwork_print_workflow import ArtworkPrintWorkflowService


class FakeArtworkPrintAssetsRepository:
    def __init__(self, assets: list[ArtworkPrintAsset]):
        self.assets = list(assets)
        self._next_id = max((int(asset.id) for asset in self.assets), default=0) + 1

    async def list_for_artwork(self, artwork_id: int):
        return [asset for asset in self.assets if int(asset.artwork_id) == int(artwork_id)]

    async def list_for_artwork_ids(self, artwork_ids: list[int]):
        return [asset for asset in self.assets if int(asset.artwork_id) in artwork_ids]

    async def get_one_or_none(self, **filter_by):
        for asset in self.assets:
            if all(getattr(asset, key) == value for key, value in filter_by.items()):
                return asset
        return None

    async def get_one(self, **filter_by):
        asset = await self.get_one_or_none(**filter_by)
        if asset is None:
            raise LookupError(filter_by)
        return asset

    async def add(self, data):
        asset = ArtworkPrintAsset(id=self._next_id, **data.model_dump())
        self._next_id += 1
        self.assets.append(asset)
        return asset

    async def edit(self, data, **filter_by):
        asset = await self.get_one(**filter_by)
        updated = asset.model_copy(update=data.model_dump(exclude_unset=False))
        self.assets = [updated if int(item.id) == int(asset.id) else item for item in self.assets]

    async def delete_one(self, asset_id: int):
        self.assets = [asset for asset in self.assets if int(asset.id) != int(asset_id)]


class FakeDB:
    def __init__(self, assets: list[ArtworkPrintAsset]):
        self.session = None
        self.artwork_print_assets = FakeArtworkPrintAssetsRepository(assets)


def make_artwork(*, artwork_id: int = 1, paper: bool = True, canvas: bool = False):
    return SimpleNamespace(
        id=artwork_id,
        slug=f"artwork-{artwork_id}",
        title="Test Artwork",
        orientation="Vertical",
        print_aspect_ratio=SimpleNamespace(label="3:4"),
        has_paper_print=paper,
        has_paper_print_limited=False,
        has_canvas_print=canvas,
        has_canvas_print_limited=False,
    )


def make_group(
    category_id: str,
    label: str,
    *,
    available: bool = True,
    print_area_width_px: int | None = None,
    print_area_height_px: int | None = None,
    print_area_source: str | None = None,
    supplier_size_inches: str | None = None,
    supplier_size_cm: str | None = None,
    print_area_dimensions: dict | None = None,
):
    return SimpleNamespace(
        ratio_label="3:4",
        category_id=category_id,
        sizes=[
            SimpleNamespace(
                slot_size_label=label,
                available=available,
                print_area_width_px=print_area_width_px,
                print_area_height_px=print_area_height_px,
                print_area_name="default" if print_area_width_px else None,
                print_area_source=print_area_source,
                print_area_dimensions=print_area_dimensions,
                supplier_size_cm=supplier_size_cm,
                supplier_size_inches=supplier_size_inches,
            )
        ],
    )


def make_service(*, assets: list[ArtworkPrintAsset] | None = None, groups: list[object] | None = None):
    service = ArtworkPrintWorkflowService(FakeDB(assets or []))
    service.storefront_repository = SimpleNamespace(
        get_active_bake=AsyncMock(return_value=SimpleNamespace(id=7, bake_key="active-bake")),
        get_groups_for_bake_ratios=AsyncMock(return_value=groups or []),
    )
    return service


def make_master_asset(
    *,
    asset_id: int,
    artwork_id: int,
    category_id: str,
    asset_role: str,
    file_url: str,
    width_px: int,
    height_px: int,
) -> ArtworkPrintAsset:
    return ArtworkPrintAsset(
        id=asset_id,
        artwork_id=artwork_id,
        provider_key="prodigi",
        category_id=category_id,
        asset_role=asset_role,
        slot_size_label=None,
        file_url=file_url,
        file_name=Path(file_url).name,
        file_ext=".png",
        mime_type="image/png",
        file_size_bytes=12345,
        checksum_sha256=f"checksum-{asset_id}",
        file_metadata={
            "width_px": width_px,
            "height_px": height_px,
            "mode": "RGB",
        },
        note=None,
    )


@pytest.mark.asyncio
async def test_bulk_readiness_blocks_when_relevant_master_is_missing():
    artwork = make_artwork(paper=True, canvas=False)
    service = make_service(groups=[make_group("paperPrintRolled", "30x40 cm")])

    summaries = await service.build_bulk_readiness_summaries([artwork])

    summary = summaries[artwork.id]
    assert summary["status"] == "blocked"
    assert summary["blocked_slots"] == 1
    assert summary["ready_slots"] == 0


@pytest.mark.asyncio
async def test_get_workflow_ignores_unavailable_sizes_for_required_dimensions():
    artwork = make_artwork(paper=True, canvas=False)
    asset = make_master_asset(
        asset_id=10,
        artwork_id=artwork.id,
        category_id="paper_bordered",
        asset_role="paper_border_ready",
        file_url="/static/print-prep/1/paper/master.png",
        width_px=4500,
        height_px=6000,
    )
    service = make_service(
        assets=[asset],
        groups=[
            make_group("paperPrintRolled", "60x80 cm", available=False),
            make_group("paperPrintRolled", "30x40 cm", available=True),
        ],
    )
    service._get_artwork_orm = AsyncMock(return_value=artwork)

    payload = await service.get_workflow(artwork.id)

    slot = next(item for item in payload["master_slots"] if item["slot_id"] == "paper_bordered")
    assert payload["overall_status"] == "ready"
    assert slot["status"] == "ready"
    assert slot["largest_size_label"] == "30x40 cm"
    assert slot["required_for_sizes"] == ["30x40 cm"]
    assert slot["required_min_px"]["width"] == 3543
    assert slot["required_min_px"]["height"] == 4724
    assert slot["required_min_px"]["source"] == "computed_fallback"


@pytest.mark.asyncio
async def test_get_workflow_prefers_baked_print_area_pixels_over_rounded_size_label():
    artwork = make_artwork(paper=False, canvas=True)
    asset = make_master_asset(
        asset_id=11,
        artwork_id=artwork.id,
        category_id="clean_master",
        asset_role="clean_master",
        file_url="/static/print-prep/1/canvas/master.png",
        width_px=14454,
        height_px=18054,
    )
    service = make_service(
        assets=[asset],
        groups=[
            make_group(
                "canvasStretched",
                "122x152",
                print_area_width_px=14454,
                print_area_height_px=18054,
                print_area_source="prodigi_product_details",
            ),
        ],
    )
    service._get_artwork_orm = AsyncMock(return_value=artwork)

    payload = await service.get_workflow(artwork.id)

    slot = next(item for item in payload["master_slots"] if item["slot_id"] == "clean_master")
    assert slot["status"] == "ready"
    assert slot["required_min_px"]["width"] == 14454
    assert slot["required_min_px"]["height"] == 18054
    assert slot["required_min_px"]["source"] == "prodigi_product_details"
    assert slot["export_guidance"]["mode"] == "exact_artboard"
    assert slot["export_guidance"]["target_width_px"] == 14454
    assert slot["export_guidance"]["target_height_px"] == 18054
    assert slot["export_guidance"]["full_file_ratio_diff_warning"] is True
    assert slot["derivative_plan"]["strategy"] == "exact_lanczos_resize"


@pytest.mark.asyncio
async def test_get_workflow_reports_canvas_mirrorwrap_coverage():
    artwork = make_artwork(paper=False, canvas=True)
    service = make_service(
        groups=[
            make_group(
                "canvasStretched",
                "20x25",
                print_area_width_px=2445,
                print_area_height_px=3045,
                print_area_source="prodigi_product_details",
                print_area_dimensions={"variant_attributes": {"wrap": "MirrorWrap"}},
            ),
            make_group(
                "canvasClassicFrame",
                "61x61",
                print_area_width_px=7245,
                print_area_height_px=7245,
                print_area_source="prodigi_product_details",
                print_area_dimensions={"variant_attributes": {"wrap": "White"}},
            ),
            make_group(
                "canvasFloatingFrame",
                "36x36",
                print_area_width_px=4200,
                print_area_height_px=4200,
                print_area_source="prodigi_product_dimensions",
                print_area_dimensions={"variant_attributes": {"wrap": "MirrorWrap"}},
            ),
        ],
    )
    service._get_artwork_orm = AsyncMock(return_value=artwork)

    payload = await service.get_workflow(artwork.id)

    slot = next(item for item in payload["master_slots"] if item["slot_id"] == "clean_master")
    coverage = slot["provider_attribute_coverage"]
    assert coverage["preferred_value"] == "MirrorWrap"
    assert coverage["total_options"] == 3
    assert coverage["preferred_count"] == 2
    assert coverage["strict_preferred_hidden_count"] == 1
    assert coverage["by_wrap"] == {"MirrorWrap": 2, "White": 1}


@pytest.mark.asyncio
async def test_generate_derivatives_from_paper_master_creates_pngs_for_available_sizes_only(tmp_path):
    artwork = make_artwork(paper=True, canvas=False)
    master_path = tmp_path / "master.png"
    Image.new("RGB", (6000, 8000), color="white").save(master_path)

    asset = make_master_asset(
        asset_id=12,
        artwork_id=artwork.id,
        category_id="paper_bordered",
        asset_role="paper_border_ready",
        file_url=f"/{master_path.as_posix()}",
        width_px=6000,
        height_px=8000,
    )
    service = make_service(
        assets=[asset],
        groups=[
            make_group("paperPrintRolled", "30x40 cm", available=True),
            make_group("paperPrintRolled", "60x80 cm", available=False),
        ],
    )
    service._get_artwork_orm = AsyncMock(return_value=artwork)
    service._build_derivative_output_dir = lambda *args, **kwargs: str(tmp_path / "derived-paper")

    generated = await service.generate_derivatives_for_master(
        artwork_id=artwork.id,
        asset_role="paper_border_ready",
    )

    assert len(generated) == 1
    derivative = generated[0]
    assert derivative.category_id == "paperPrintRolled"
    assert derivative.slot_size_label == "30x40 cm"
    assert derivative.file_ext == ".png"
    assert derivative.mime_type == "image/png"
    assert derivative.file_metadata["generated_from_asset_id"] == asset.id
    assert derivative.file_metadata["derivative_kind"] == "resize"


@pytest.mark.asyncio
async def test_generate_clean_master_derivatives_include_canvas_and_framed_paper(tmp_path):
    artwork = make_artwork(paper=False, canvas=True)
    master_path = tmp_path / "canvas-clean.png"
    Image.new("RGB", (6000, 8000), color="white").save(master_path)

    asset = make_master_asset(
        asset_id=13,
        artwork_id=artwork.id,
        category_id="clean_master",
        asset_role="clean_master",
        file_url=f"/{master_path.as_posix()}",
        width_px=6000,
        height_px=8000,
    )
    service = make_service(
        assets=[asset],
        groups=[
            make_group("canvasStretched", "30x40 cm", available=True),
            make_group("canvasClassicFrame", "30x40 cm", available=False),
            make_group("canvasFloatingFrame", "30x40 cm", available=True),
            make_group("canvasRolled", "30x40 cm", available=True),
            make_group("paperPrintBoxFramed", "30x40 cm", available=True),
        ],
    )
    service._get_artwork_orm = AsyncMock(return_value=artwork)
    service._build_derivative_output_dir = (
        lambda artwork_id, slot_id, category_id: str(tmp_path / slot_id / category_id)
    )

    generated = await service.generate_derivatives_for_master(
        artwork_id=artwork.id,
        asset_role="clean_master",
    )

    generated_pairs = sorted((item.category_id, item.slot_size_label) for item in generated)
    assert generated_pairs == [
        ("canvasFloatingFrame", "30x40 cm"),
        ("canvasRolled", "30x40 cm"),
        ("canvasStretched", "30x40 cm"),
        ("paperPrintBoxFramed", "30x40 cm"),
    ]
    rolled_asset = next(item for item in generated if item.category_id == "canvasRolled")
    assert rolled_asset.file_metadata["derivative_kind"] == "resize"


@pytest.mark.asyncio
async def test_generate_clean_master_derivative_resizes_to_exact_target_when_ratio_differs(tmp_path):
    artwork = make_artwork(paper=False, canvas=True)
    master_path = tmp_path / "canvas-clean.png"
    Image.new("RGB", (6000, 8000), color="white").save(master_path)

    asset = make_master_asset(
        asset_id=14,
        artwork_id=artwork.id,
        category_id="clean_master",
        asset_role="clean_master",
        file_url=f"/{master_path.as_posix()}",
        width_px=6000,
        height_px=8000,
    )
    service = make_service(
        assets=[asset],
        groups=[
            make_group(
                "canvasStretched",
                "20x25",
                print_area_width_px=3600,
                print_area_height_px=4200,
                print_area_source="prodigi_product_details",
                supplier_size_inches='"8x10"""',
                print_area_dimensions={
                    "variant_attributes": {
                        "edge": "38mm",
                        "wrap": "MirrorWrap",
                    }
                },
            ),
        ],
    )
    service._get_artwork_orm = AsyncMock(return_value=artwork)
    service._build_derivative_output_dir = (
        lambda artwork_id, slot_id, category_id: str(tmp_path / slot_id / category_id)
    )

    generated = await service.generate_derivatives_for_master(
        artwork_id=artwork.id,
        asset_role="clean_master",
    )

    assert len(generated) == 1
    derivative = generated[0]
    assert derivative.file_metadata["width_px"] == 3600
    assert derivative.file_metadata["height_px"] == 4200
    assert derivative.file_metadata["derivative_kind"] == "resize"


@pytest.mark.asyncio
async def test_delete_generated_assets_for_master_removes_db_rows_and_files(tmp_path):
    artwork = make_artwork()
    generated_path = tmp_path / "generated.png"
    Image.new("RGB", (300, 400), color="white").save(generated_path)

    master_asset = make_master_asset(
        asset_id=21,
        artwork_id=artwork.id,
        category_id="paper_bordered",
        asset_role="paper_border_ready",
        file_url="/static/print-prep/1/paper/master.png",
        width_px=6000,
        height_px=8000,
    )
    generated_asset = ArtworkPrintAsset(
        id=22,
        artwork_id=artwork.id,
        provider_key="prodigi",
        category_id="paperPrintRolled",
        asset_role="paper_border_ready",
        slot_size_label="30x40 cm",
        file_url=f"/{generated_path.as_posix()}",
        file_name="generated.png",
        file_ext=".png",
        mime_type="image/png",
        file_size_bytes=456,
        checksum_sha256="generated",
        file_metadata={
            "width_px": 300,
            "height_px": 400,
            "generated_from_asset_id": master_asset.id,
            "generated_from_asset_role": master_asset.asset_role,
            "derivative_kind": "resize",
        },
        note="Auto-generated from master slot",
    )
    unrelated_asset = ArtworkPrintAsset(
        id=23,
        artwork_id=artwork.id,
        provider_key="prodigi",
        category_id="paperPrintRolled",
        asset_role="paper_border_ready",
        slot_size_label="20x30 cm",
        file_url="/static/print-prep/1/paper/other.png",
        file_name="other.png",
        file_ext=".png",
        mime_type="image/png",
        file_size_bytes=123,
        checksum_sha256="other",
        file_metadata={"width_px": 200, "height_px": 300},
        note=None,
    )
    service = make_service(assets=[master_asset, generated_asset, unrelated_asset])

    await service.delete_generated_assets_for_master(master_asset)

    remaining_ids = sorted(asset.id for asset in service.db.artwork_print_assets.assets)
    assert remaining_ids == [21, 23]
    assert not generated_path.exists()
