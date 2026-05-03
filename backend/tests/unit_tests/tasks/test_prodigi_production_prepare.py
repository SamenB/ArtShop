from argparse import Namespace
from types import SimpleNamespace

import pytest

from src.integrations.prodigi.services import prodigi_production_prepare as prepare_service
from src.integrations.prodigi.tasks import prodigi_production_prepare


def _args(tmp_path, **overrides):
    defaults = {
        "skip_csv_rebuild": False,
        "curated_csv": str(tmp_path / "prodigi_storefront_source.csv"),
        "selected_ratio": None,
        "selected_country": None,
        "selected_paper_material": None,
        "strict_fulfillment_only": False,
        "country": None,
        "ratio": None,
        "category": None,
        "max_sizes_per_group": 0,
        "simulate_orders": 3,
        "batch_size": 1,
        "include_api_checks": False,
        "include_quotes": False,
        "require_api_checks": False,
        "min_samples": 1,
        "min_simulated_orders": 1,
        "max_failures": 0,
        "min_pass_rate": 1.0,
        "output": str(tmp_path / "report.json"),
    }
    defaults.update(overrides)
    return Namespace(**defaults)


def _write_curated_csv(path):
    path.write_text(
        "sku,category_id,Product price\nSKU-1,paperPrintRolled,10.00\n",
        encoding="utf-8",
    )


class _FakeDbManager:
    def __init__(self, *args, **kwargs):
        self.session = SimpleNamespace()

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return None


class _FakeRebuildService:
    calls = []
    result = {"status": "baked", "bake": {"id": 1}}

    def __init__(self, db, curated_csv_path=None):
        self.db = db
        self.curated_csv_path = curated_csv_path

    async def rebuild(self, **kwargs):
        self.calls.append({"curated_csv_path": self.curated_csv_path, "kwargs": kwargs})
        return self.result


class _FakeValidationService:
    approved = True
    calls = []

    def __init__(self, session):
        self.session = session

    async def run(self, config):
        self.calls.append(config)
        return {"approved": self.approved, "summary": {"sample_count": 1}}


async def _fake_clear_cache():
    return {"cleared": 3}


@pytest.fixture(autouse=True)
def _patch_runtime(monkeypatch):
    _FakeRebuildService.calls = []
    _FakeValidationService.calls = []
    _FakeValidationService.approved = True
    monkeypatch.setattr(prodigi_production_prepare, "DBManager", _FakeDbManager)
    monkeypatch.setattr(
        prepare_service,
        "ProdigiCsvStorefrontRebuildService",
        _FakeRebuildService,
    )
    monkeypatch.setattr(
        prepare_service,
        "ProdigiFulfillmentValidationService",
        _FakeValidationService,
    )
    monkeypatch.setattr(
        prepare_service,
        "clear_artwork_print_storefront_cache",
        _fake_clear_cache,
    )


@pytest.mark.asyncio
async def test_production_prepare_normal_run_rebuilds_validates_clears_cache_and_writes_report(
    tmp_path,
):
    csv_path = tmp_path / "prodigi_storefront_source.csv"
    _write_curated_csv(csv_path)
    args = _args(tmp_path, curated_csv=str(csv_path))

    report = await prodigi_production_prepare.run(args)

    assert report["status"] == "ready"
    assert report["csv_rebuild"] == _FakeRebuildService.result
    assert report["cache_clear"] == {"cleared": 3}
    assert _FakeRebuildService.calls
    assert _FakeValidationService.calls
    assert (tmp_path / "report.json").exists()


@pytest.mark.asyncio
async def test_production_prepare_skip_csv_rebuild_still_validates_and_clears_cache(tmp_path):
    args = _args(tmp_path, skip_csv_rebuild=True)

    report = await prodigi_production_prepare.run(args)

    assert report["status"] == "ready"
    assert report["csv_rebuild"] is None
    assert _FakeRebuildService.calls == []
    assert _FakeValidationService.calls
    assert report["cache_clear"] == {"cleared": 3}


@pytest.mark.asyncio
async def test_production_prepare_failed_validation_returns_failed_status(tmp_path):
    csv_path = tmp_path / "prodigi_storefront_source.csv"
    _write_curated_csv(csv_path)
    _FakeValidationService.approved = False

    report = await prodigi_production_prepare.run(_args(tmp_path, curated_csv=str(csv_path)))

    assert report["status"] == "failed"


@pytest.mark.asyncio
async def test_production_prepare_empty_curated_csv_fails_before_heavy_work(tmp_path):
    csv_path = tmp_path / "prodigi_storefront_source.csv"
    csv_path.write_text("", encoding="utf-8")

    with pytest.raises(RuntimeError, match="Curated Prodigi CSV"):
        await prodigi_production_prepare.run(_args(tmp_path, curated_csv=str(csv_path)))

    assert _FakeRebuildService.calls == []
    assert _FakeValidationService.calls == []
