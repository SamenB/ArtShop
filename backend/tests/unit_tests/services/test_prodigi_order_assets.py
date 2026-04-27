from __future__ import annotations

from types import SimpleNamespace

from PIL import Image

from src.services.prodigi_order_assets import ProdigiOrderAssetService


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
