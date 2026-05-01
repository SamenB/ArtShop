from __future__ import annotations

import csv
from dataclasses import dataclass

import pytest

from src.config import settings
from src.integrations.prodigi.catalog_pipeline.curated_source import (
    ProdigiCuratedCsvSource,
)
from src.integrations.prodigi.catalog_pipeline.curator import ProdigiCuratedCsvBuilder
from src.integrations.prodigi.catalog_pipeline.parser import (
    curated_row_from_parsed,
    parse_prodigi_csv_row,
)
from src.integrations.prodigi.catalog_pipeline.planner import ProdigiCatalogSnapshotPlanner
from src.integrations.prodigi.catalog_pipeline.raw_source import ProdigiRawCsvSource
from src.integrations.prodigi.catalog_pipeline.retention import (
    ProdigiStorefrontBakeRetentionService,
)
from src.integrations.prodigi.catalog_pipeline.source import (
    ProdigiCsvSource,
    resolve_prodigi_csv_root,
)


def _write_csv(path, rows: list[dict[str, str]]) -> None:
    fieldnames = sorted({key for row in rows for key in row})
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def _rolled_paper_row(**overrides: str) -> dict[str, str]:
    row = {
        "SKU": "GLOBAL-HGE-40X50",
        "Category": "Prints",
        "Product type": "Rolled Art Prints",
        "Product description": "Hahnemuhle German Etching archival paper",
        "Size (cm)": "40x50",
        "Size (inches)": "16x20",
        "Paper type": "Hahnemuhle German Etching",
        "Source country": "GB",
        "Destination country": "DE",
        "Destination Country Name": "Germany",
        "Shipping method": "Standard",
        "ServiceName": "Standard",
        "ServiceLevel": "STANDARD",
        "Product price": "12.50",
        "Product currency": "EUR",
        "Shipping price": "4.50",
        "Shipping currency": "EUR",
        "Minimum shipping (days)": "4",
        "Maximum shipping (days)": "8",
    }
    row.update(overrides)
    return row


def _stretched_canvas_row(**overrides: str) -> dict[str, str]:
    row = {
        "SKU": "CAN-38MM-SC-16x20",
        "Category": "Canvas",
        "Product type": "Stretched Canvas",
        "Product description": "38mm Stretched Canvas Standard Canvas",
        "Size (cm)": "40x50",
        "Size (inches)": "16x20",
        "Paper type": "Standard Canvas",
        "Wrap": "MirrorWrap",
        "Source country": "GB",
        "Destination country": "DE",
        "Destination Country Name": "Germany",
        "Shipping method": "Standard",
        "ServiceName": "Standard",
        "ServiceLevel": "STANDARD",
        "Product price": "20.00",
        "Product currency": "EUR",
        "Shipping price": "8.00",
        "Shipping currency": "EUR",
        "Minimum shipping (days)": "4",
        "Maximum shipping (days)": "8",
    }
    row.update(overrides)
    return row


@dataclass(frozen=True, slots=True)
class _Dims:
    label: str


class _Selector:
    def match_ratio(self, size_cm, size_inches):
        return "4:5"

    def parse_size_dims(self, size_cm, size_inches):
        return _Dims("40x50")


class _Preview:
    def _remember_country_name(self, country_names, country_code, country_name):
        country_names[country_code] = country_name or country_code

    def _format_delivery_days(self, min_days, max_days):
        return f"{min_days}-{max_days} days"


class _StorefrontPolicy:
    def _matches_policy(self, category_id, parsed):
        return True


class _FulfillmentPolicy:
    def _min_or_current(self, current, value):
        if current is None:
            return value
        if value is None:
            return current
        return min(current, value)


class _ShippingPolicy:
    def normalize_tier(self, shipping_method, service_level):
        return (shipping_method or "standard").lower()

    def _offer_rank(self, offer, destination_country):
        return (offer.get("shipping_price") or 0, offer.get("product_price") or 0)


def _planner() -> ProdigiCatalogSnapshotPlanner:
    return ProdigiCatalogSnapshotPlanner(
        category_defs=[
            {
                "id": "paperPrintRolled",
                "medium": "paper",
                "material": "hahnemuhle_german_etching",
                "presentation_values": ("rolled",),
                "frame_type_values": ("no_frame",),
            }
        ],
        selector=_Selector(),
        preview_service=_Preview(),
        storefront_policy=_StorefrontPolicy(),
        fulfillment_policy=_FulfillmentPolicy(),
        shipping_policy=_ShippingPolicy(),
    )


def test_raw_source_uses_explicit_configured_root(tmp_path, monkeypatch) -> None:
    csv_root = tmp_path / "prodigi-raw"
    csv_root.mkdir()
    _write_csv(csv_root / "catalog.csv", [_rolled_paper_row()])
    monkeypatch.setattr(settings, "PRODIGI_RAW_CSV_ROOT", str(csv_root))

    source = ProdigiRawCsvSource()

    assert resolve_prodigi_csv_root() == csv_root.resolve()
    assert [path.name for path in source.discover_csv_files()] == ["catalog.csv"]
    assert source.describe().rows_seen == 1


def test_raw_source_missing_root_has_actionable_error(tmp_path, monkeypatch) -> None:
    missing = tmp_path / "missing-prodigi-raw"
    monkeypatch.setattr(settings, "PRODIGI_RAW_CSV_ROOT", str(missing))

    with pytest.raises(FileNotFoundError, match="PRODIGI_RAW_CSV_ROOT"):
        resolve_prodigi_csv_root()


def test_parser_normalizes_rolled_paper_row(tmp_path) -> None:
    parsed = parse_prodigi_csv_row(tmp_path / "catalog.csv", _rolled_paper_row())

    assert parsed is not None
    assert parsed["sku"] == "GLOBAL-HGE-40X50"
    assert parsed["normalized_medium"] == "paper"
    assert parsed["normalized_presentation"] == "rolled"
    assert parsed["normalized_frame_type"] == "no_frame"
    assert parsed["normalized_material"] == "hahnemuhle_german_etching"
    assert parsed["is_relevant_for_artshop"] is True
    assert parsed["route_key"].startswith("GLOBAL-HGE-40X50|")


def test_curated_source_reads_committed_shape(tmp_path) -> None:
    parsed = parse_prodigi_csv_row(tmp_path / "raw.csv", _rolled_paper_row())
    assert parsed is not None
    curated_csv = tmp_path / "prodigi_storefront_source.csv"
    _write_csv(curated_csv, [curated_row_from_parsed(parsed, category_id="paperPrintRolled")])

    source = ProdigiCuratedCsvSource(csv_path=curated_csv)
    record = next(source.iter_records())
    reparsed = parse_prodigi_csv_row(record.file_path, record.row)

    assert source.describe().files_seen == 1
    assert reparsed is not None
    assert reparsed["sku"] == "GLOBAL-HGE-40X50"
    assert reparsed["category_id"] == "paperPrintRolled"
    assert reparsed["product_price"] == parsed["product_price"]


def test_planner_aggregates_supported_offer_from_curated_source(tmp_path) -> None:
    parsed = parse_prodigi_csv_row(tmp_path / "raw.csv", _rolled_paper_row())
    assert parsed is not None
    curated_csv = tmp_path / "prodigi_storefront_source.csv"
    _write_csv(curated_csv, [curated_row_from_parsed(parsed, category_id="paperPrintRolled")])

    plan = _planner().build_plan(ProdigiCuratedCsvSource(csv_path=curated_csv))

    assert plan.files_seen == 1
    assert plan.rows_seen == 1
    assert plan.matched_row_count == 1
    assert plan.kept_by_category["paperPrintRolled"] == 1
    offer = plan.offers_by_slot["4:5"]["DE"]["paperPrintRolled"]["40x50"]["standard"]
    assert offer["sku"] == "GLOBAL-HGE-40X50"
    assert offer["total_cost"] == 17.0


def test_curator_writes_deterministic_deduped_source(tmp_path, monkeypatch) -> None:
    raw_root = tmp_path / "raw"
    raw_root.mkdir()
    _write_csv(
        raw_root / "catalog-b.csv",
        [
            _rolled_paper_row(
                SKU="GLOBAL-HGE-FR-40X50",
                **{
                    "Destination country": "FR",
                    "Destination Country Name": "France",
                },
            )
        ],
    )
    _write_csv(raw_root / "catalog-a.csv", [_rolled_paper_row(), _rolled_paper_row()])
    output = tmp_path / "prodigi_storefront_source.csv"
    monkeypatch.setattr(
        ProdigiCuratedCsvBuilder,
        "_all_category_defs",
        lambda self: _planner().category_defs,
    )

    result = ProdigiCuratedCsvBuilder(raw_csv_root=raw_root, output_path=output).build()
    second = output.read_bytes()
    result_again = ProdigiCuratedCsvBuilder(raw_csv_root=raw_root, output_path=output).build()

    assert result.raw_files_seen == 2
    assert result.raw_rows_seen == 3
    assert result.curated_rows_written == 2
    assert result.duplicate_route_rows == 1
    assert result_again.curated_rows_written == 2
    assert output.read_bytes() == second


def test_curator_keeps_only_production_canvas_wrap_variant(
    tmp_path,
    monkeypatch,
) -> None:
    raw_root = tmp_path / "raw"
    raw_root.mkdir()
    _write_csv(
        raw_root / "catalog.csv",
        [
            _stretched_canvas_row(Wrap="MirrorWrap"),
            _stretched_canvas_row(Wrap="Black"),
            _stretched_canvas_row(Wrap="MirrorWrap"),
        ],
    )
    output = tmp_path / "prodigi_storefront_source.csv"
    monkeypatch.setattr(
        ProdigiCuratedCsvBuilder,
        "_all_category_defs",
        lambda self: [
            {
                "id": "canvasStretched",
                "medium": "canvas",
                "material": "standard_canvas",
                "presentation_values": ("stretched",),
                "frame_type_values": ("stretched_canvas",),
                "recommended_defaults": {"wrap": "MirrorWrap"},
            }
        ],
    )

    result = ProdigiCuratedCsvBuilder(raw_csv_root=raw_root, output_path=output).build()
    with output.open("r", encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))

    assert result.raw_rows_seen == 3
    assert result.parsed_rows_seen == 2
    assert result.curated_rows_written == 1
    assert result.duplicate_route_rows == 1
    assert rows[0]["wrap"] == "MirrorWrap"
    assert rows[0]["category_id"] == "canvasStretched"


def test_curator_size_guard_removes_temp_file(tmp_path, monkeypatch) -> None:
    raw_root = tmp_path / "raw"
    raw_root.mkdir()
    _write_csv(raw_root / "catalog.csv", [_rolled_paper_row()])
    output = tmp_path / "prodigi_storefront_source.csv"
    monkeypatch.setattr(
        ProdigiCuratedCsvBuilder,
        "_all_category_defs",
        lambda self: _planner().category_defs,
    )

    with pytest.raises(RuntimeError, match="safety limit"):
        ProdigiCuratedCsvBuilder(raw_csv_root=raw_root, output_path=output).build(
            max_size_bytes=1
        )

    assert not output.exists()
    assert not output.with_suffix(".csv.tmp").exists()


def test_backward_compatible_csv_source_still_streams_raw_rows(tmp_path) -> None:
    csv_root = tmp_path / "prodigi-raw"
    csv_root.mkdir()
    _write_csv(csv_root / "catalog.csv", [_rolled_paper_row()])

    source = ProdigiCsvSource(csv_root=csv_root)

    assert source.describe().rows_seen == 1


def test_bake_retention_keeps_active_and_two_latest_inactive() -> None:
    decision = ProdigiStorefrontBakeRetentionService.decide(
        active_bake_id=12,
        inactive_bake_ids=[11, 10, 9, 8],
        keep_inactive=2,
    )

    assert decision.active_bake_id == 12
    assert decision.kept_inactive_bake_ids == [11, 10]
    assert decision.deleted_bake_ids == [9, 8]
