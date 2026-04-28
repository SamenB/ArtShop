from __future__ import annotations

from types import SimpleNamespace

import pytest
from PIL import Image

from src.integrations.prodigi.services.prodigi_order_assets import ProdigiOrderAssetService


class _FakeResolver:
    result = {
        "print_area_width_px": 420,
        "print_area_height_px": 520,
        "print_area_name": "one",
        "print_area_source": "prodigi_product_details",
        "print_area_dimensions": {"print_area": "one"},
    }
    calls = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        return None

    async def resolve(self, **kwargs):
        self.calls.append(kwargs)
        return dict(self.result)


def test_clean_master_render_cover_crops_to_exact_target_without_white_edges(tmp_path):
    master_path = tmp_path / "clean-master.png"
    image = Image.new("RGB", (800, 1000), color=(12, 80, 160))
    image.save(master_path)
    master_asset = SimpleNamespace(id=7, file_url=f"/{master_path.as_posix()}")
    service = ProdigiOrderAssetService(db_session=None)

    rendered = service.render_from_master(
        master_asset=master_asset,
        category_id="canvasStretched",
        slot_size_label="40x50",
        target_width=420,
        target_height=520,
        output_dir=tmp_path / "out",
    )

    with Image.open(rendered["file_path"]) as output:
        assert output.size == (420, 520)
        corners = [
            output.getpixel((0, 0)),
            output.getpixel((419, 0)),
            output.getpixel((0, 519)),
            output.getpixel((419, 519)),
        ]
        assert all(pixel != (255, 255, 255) for pixel in corners)


def test_mounted_framed_paper_uses_clean_master_cover_crop(tmp_path):
    master_path = tmp_path / "mounted-master.png"
    Image.new("RGB", (800, 1000), color=(120, 40, 30)).save(master_path)
    master_asset = SimpleNamespace(id=17, file_url=f"/{master_path.as_posix()}")
    service = ProdigiOrderAssetService(db_session=None)

    rendered = service.render_from_master(
        master_asset=master_asset,
        category_id="paperPrintBoxFramedMounted",
        slot_size_label="46x61",
        target_width=420,
        target_height=600,
        output_dir=tmp_path / "out",
    )

    with Image.open(rendered["file_path"]) as output:
        assert output.size == (420, 600)
        assert output.getpixel((0, 0)) != (255, 255, 255)


def test_horizontal_master_orients_vertical_target_to_horizontal_output(tmp_path):
    master_path = tmp_path / "clean-master-horizontal.png"
    Image.new("RGB", (1000, 800), color=(80, 12, 160)).save(master_path)
    master_asset = SimpleNamespace(id=8, file_url=f"/{master_path.as_posix()}")
    service = ProdigiOrderAssetService(db_session=None)

    rendered = service.render_from_master(
        master_asset=master_asset,
        category_id="canvasStretched",
        slot_size_label="40x50",
        target_width=400,
        target_height=500,
        output_dir=tmp_path / "out",
    )

    with Image.open(rendered["file_path"]) as output:
        assert output.size == (500, 400)


def test_paper_rolled_master_contains_on_white_artboard(tmp_path):
    master_path = tmp_path / "paper-master.png"
    Image.new("RGB", (800, 1000), color=(10, 10, 10)).save(master_path)
    master_asset = SimpleNamespace(id=9, file_url=f"/{master_path.as_posix()}")
    service = ProdigiOrderAssetService(db_session=None)

    rendered = service.render_from_master(
        master_asset=master_asset,
        category_id="paperPrintRolled",
        slot_size_label="40x50",
        target_width=500,
        target_height=500,
        output_dir=tmp_path / "out",
    )

    with Image.open(rendered["file_path"]) as output:
        assert output.size == (500, 500)
        assert output.getpixel((0, 0)) == (255, 255, 255)
        assert output.getpixel((250, 250)) == (10, 10, 10)


@pytest.mark.asyncio
async def test_verify_target_size_with_prodigi_api_returns_live_print_area(monkeypatch):
    monkeypatch.setattr(
        "src.integrations.prodigi.services.prodigi_order_assets.settings.PRODIGI_API_KEY",
        "test-key",
    )
    monkeypatch.setattr(
        "src.integrations.prodigi.services.prodigi_order_assets.ProdigiPrintAreaResolver",
        _FakeResolver,
    )
    _FakeResolver.calls = []
    service = ProdigiOrderAssetService(db_session=None)

    verified = await service.verify_target_size_with_prodigi_api(
        target={
            "width_px": 420,
            "height_px": 520,
            "print_area_name": "default",
            "print_area_source": "prodigi_product_details",
            "supplier_size_inches": '14x17"',
            "supplier_size_cm": "36x43",
            "slot_size_label": "36x43",
        },
        category_id="canvasStretched",
        sku="GLOBAL-CAN-14X17",
        country_code="DE",
        attributes={"wrap": "MirrorWrap"},
    )

    assert verified is not None
    assert verified["width_px"] == 420
    assert verified["height_px"] == 520
    assert verified["print_area_name"] == "one"
    assert verified["prodigi_verified"] is True
    assert _FakeResolver.calls[0]["attributes"] == {"wrap": "MirrorWrap"}


@pytest.mark.asyncio
async def test_verify_target_size_with_prodigi_api_rejects_dimension_drift(monkeypatch):
    monkeypatch.setattr(
        "src.integrations.prodigi.services.prodigi_order_assets.settings.PRODIGI_API_KEY",
        "test-key",
    )
    monkeypatch.setattr(
        "src.integrations.prodigi.services.prodigi_order_assets.ProdigiPrintAreaResolver",
        _FakeResolver,
    )
    _FakeResolver.result = {
        "print_area_width_px": 500,
        "print_area_height_px": 620,
        "print_area_name": "default",
        "print_area_source": "prodigi_product_details",
    }
    service = ProdigiOrderAssetService(db_session=None)

    verified = await service.verify_target_size_with_prodigi_api(
        target={
            "width_px": 420,
            "height_px": 520,
            "print_area_name": "default",
            "print_area_source": "prodigi_product_details",
            "slot_size_label": "36x43",
        },
        category_id="canvasStretched",
        sku="GLOBAL-CAN-14X17",
        country_code="DE",
        attributes={},
    )

    assert verified is None
