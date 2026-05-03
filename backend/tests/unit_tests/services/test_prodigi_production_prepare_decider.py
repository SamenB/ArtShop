from types import SimpleNamespace

import pytest

from src.integrations.prodigi.catalog_pipeline.context import PIPELINE_VERSION
from src.integrations.prodigi.services.prodigi_business_policy import (
    ProdigiBusinessPolicyService,
)
from src.integrations.prodigi.services.prodigi_production_prepare_decider import (
    ProdigiProductionPrepareDecider,
)


def _bake(**overrides):
    defaults = {
        "id": 12,
        "bake_key": "active",
        "status": "ready",
        "source_sha256": "abc",
        "source_row_count": 10,
        "source_size_bytes": 1000,
        "pipeline_version": PIPELINE_VERSION,
        "policy_version": ProdigiBusinessPolicyService.POLICY_VERSION,
        "offer_group_count": 3,
        "offer_size_count": 9,
    }
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


class _Decider(ProdigiProductionPrepareDecider):
    def __init__(
        self,
        *,
        source=None,
        source_error=None,
        active_bake=None,
        payload_count=5,
        settings=None,
    ):
        super().__init__(SimpleNamespace())
        self._source = source or {
            "sha256": "abc",
            "rows_seen": 10,
            "size_bytes": 1000,
            "path": "prodigi_storefront_source.csv",
        }
        self._source_error = source_error
        self._active_bake = active_bake
        self._payload_count = payload_count
        self._settings = settings

    def _source_payload(self):
        return self._source, self._source_error

    async def _load_active_bake(self):
        return self._active_bake

    async def _count_materialized_payloads(self, bake_id: int) -> int:
        return self._payload_count

    async def _settings_payload(self):
        return self._settings


@pytest.mark.asyncio
async def test_prepare_decider_skips_when_source_and_materialized_bake_are_current():
    decision = await _Decider(active_bake=_bake()).evaluate()

    assert decision.prepare_needed is False
    assert decision.status == "skipped"
    assert decision.reasons == []


@pytest.mark.asyncio
async def test_prepare_decider_runs_when_csv_fingerprint_changed():
    decision = await _Decider(
        source={"sha256": "new", "rows_seen": 11, "size_bytes": 1001},
        active_bake=_bake(),
    ).evaluate()

    assert decision.prepare_needed is True
    assert "source_sha256_changed" in decision.reasons
    assert "source_row_count_changed" in decision.reasons
    assert "source_size_bytes_changed" in decision.reasons


@pytest.mark.asyncio
async def test_prepare_decider_runs_when_pipeline_or_policy_changed():
    decision = await _Decider(
        active_bake=_bake(pipeline_version="old", policy_version="old"),
    ).evaluate()

    assert decision.prepare_needed is True
    assert "pipeline_version_changed" in decision.reasons
    assert "policy_version_changed" in decision.reasons


@pytest.mark.asyncio
async def test_prepare_decider_runs_for_first_deploy_without_active_bake():
    decision = await _Decider(active_bake=None).evaluate()

    assert decision.prepare_needed is True
    assert decision.reasons == ["no_active_bake"]


@pytest.mark.asyncio
async def test_prepare_decider_runs_when_materialized_payloads_are_missing():
    decision = await _Decider(active_bake=_bake(), payload_count=0).evaluate()

    assert decision.prepare_needed is True
    assert "materialized_payloads_missing" in decision.reasons


@pytest.mark.asyncio
async def test_prepare_decider_runs_when_storefront_settings_policy_version_changed():
    decision = await _Decider(
        active_bake=_bake(),
        settings={"payload_policy_version": "old"},
    ).evaluate()

    assert decision.prepare_needed is True
    assert "settings_payload_policy_version_changed" in decision.reasons
