from __future__ import annotations

from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

from sqlalchemy import func, select

from src.integrations.prodigi.catalog_pipeline.context import PIPELINE_VERSION
from src.integrations.prodigi.catalog_pipeline.curated_source import ProdigiCuratedCsvSource
from src.integrations.prodigi.services.prodigi_business_policy import (
    ProdigiBusinessPolicyService,
)
from src.models.prodigi_storefront import (
    ProdigiArtworkStorefrontPayloadOrm,
    ProdigiStorefrontBakeOrm,
    ProdigiStorefrontSettingsOrm,
)


@dataclass(slots=True)
class ProdigiProductionPrepareDecision:
    prepare_needed: bool
    status: str
    reasons: list[str] = field(default_factory=list)
    source: dict[str, Any] | None = None
    active_bake: dict[str, Any] | None = None
    materialized_payload_count: int = 0
    expected: dict[str, Any] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


class ProdigiProductionPrepareDecider:
    """Decide whether production needs a CSV-backed Prodigi storefront rebuild."""

    def __init__(self, db_session: Any, curated_csv_path: str | Path | None = None):
        self.db_session = db_session
        self.curated_csv_path = curated_csv_path

    async def evaluate(self, *, force: bool = False) -> ProdigiProductionPrepareDecision:
        expected = {
            "pipeline_version": PIPELINE_VERSION,
            "policy_version": ProdigiBusinessPolicyService.POLICY_VERSION,
        }
        if force:
            return ProdigiProductionPrepareDecision(
                prepare_needed=True,
                status="needed",
                reasons=["force_requested"],
                expected=expected,
            )

        source_payload, source_error = self._source_payload()
        if source_error:
            return ProdigiProductionPrepareDecision(
                prepare_needed=True,
                status="needed",
                reasons=[source_error],
                source=source_payload,
                expected=expected,
            )

        active_bake = await self._load_active_bake()
        if active_bake is None:
            return ProdigiProductionPrepareDecision(
                prepare_needed=True,
                status="needed",
                reasons=["no_active_bake"],
                source=source_payload,
                expected=expected,
            )

        bake_payload = self._bake_payload(active_bake)
        payload_count = await self._count_materialized_payloads(int(active_bake.id))
        settings_payload = await self._settings_payload()
        reasons = self._staleness_reasons(
            source_payload=source_payload or {},
            bake_payload=bake_payload,
            settings_payload=settings_payload,
            materialized_payload_count=payload_count,
            expected=expected,
        )

        return ProdigiProductionPrepareDecision(
            prepare_needed=bool(reasons),
            status="needed" if reasons else "skipped",
            reasons=reasons,
            source=source_payload,
            active_bake={**bake_payload, "settings": settings_payload},
            materialized_payload_count=payload_count,
            expected=expected,
        )

    def _source_payload(self) -> tuple[dict[str, Any] | None, str | None]:
        try:
            stats = ProdigiCuratedCsvSource(csv_path=self.curated_csv_path).describe()
        except FileNotFoundError as exc:
            return {"error": str(exc)}, "curated_csv_missing"

        payload = {
            "path": stats.path,
            "sha256": stats.sha256,
            "rows_seen": stats.rows_seen,
            "size_bytes": stats.size_bytes,
        }
        if stats.size_bytes <= 0 or stats.rows_seen <= 0:
            return payload, "curated_csv_empty"
        return payload, None

    async def _load_active_bake(self) -> ProdigiStorefrontBakeOrm | None:
        result = await self.db_session.execute(
            select(ProdigiStorefrontBakeOrm)
            .where(ProdigiStorefrontBakeOrm.is_active.is_(True))
            .order_by(ProdigiStorefrontBakeOrm.id.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def _count_materialized_payloads(self, bake_id: int) -> int:
        result = await self.db_session.execute(
            select(func.count(ProdigiArtworkStorefrontPayloadOrm.id)).where(
                ProdigiArtworkStorefrontPayloadOrm.bake_id == bake_id
            )
        )
        return int(result.scalar_one() or 0)

    async def _settings_payload(self) -> dict[str, Any] | None:
        result = await self.db_session.execute(
            select(ProdigiStorefrontSettingsOrm)
            .order_by(ProdigiStorefrontSettingsOrm.id.asc())
            .limit(1)
        )
        settings = result.scalar_one_or_none()
        if settings is None:
            return None
        return {
            "payload_policy_version": settings.payload_policy_version,
        }

    def _bake_payload(self, bake: ProdigiStorefrontBakeOrm) -> dict[str, Any]:
        return {
            "id": bake.id,
            "bake_key": bake.bake_key,
            "status": bake.status,
            "source_sha256": bake.source_sha256,
            "source_row_count": bake.source_row_count,
            "source_size_bytes": bake.source_size_bytes,
            "pipeline_version": bake.pipeline_version,
            "policy_version": bake.policy_version,
            "offer_group_count": bake.offer_group_count,
            "offer_size_count": bake.offer_size_count,
        }

    def _staleness_reasons(
        self,
        *,
        source_payload: dict[str, Any],
        bake_payload: dict[str, Any],
        settings_payload: dict[str, Any] | None,
        materialized_payload_count: int,
        expected: dict[str, Any],
    ) -> list[str]:
        reasons: list[str] = []
        comparisons = [
            ("source_sha256", bake_payload.get("source_sha256"), source_payload.get("sha256")),
            (
                "source_row_count",
                bake_payload.get("source_row_count"),
                source_payload.get("rows_seen"),
            ),
            (
                "source_size_bytes",
                bake_payload.get("source_size_bytes"),
                source_payload.get("size_bytes"),
            ),
            (
                "pipeline_version",
                bake_payload.get("pipeline_version"),
                expected["pipeline_version"],
            ),
            ("policy_version", bake_payload.get("policy_version"), expected["policy_version"]),
        ]
        for reason, current, desired in comparisons:
            if current != desired:
                reasons.append(f"{reason}_changed")

        if str(bake_payload.get("status") or "").lower() != "ready":
            reasons.append("active_bake_not_ready")
        if int(bake_payload.get("offer_group_count") or 0) <= 0:
            reasons.append("active_bake_has_no_offer_groups")
        if int(bake_payload.get("offer_size_count") or 0) <= 0:
            reasons.append("active_bake_has_no_offer_sizes")
        if materialized_payload_count <= 0:
            reasons.append("materialized_payloads_missing")
        if (
            settings_payload
            and settings_payload.get("payload_policy_version") != expected["policy_version"]
        ):
            reasons.append("settings_payload_policy_version_changed")

        return reasons
