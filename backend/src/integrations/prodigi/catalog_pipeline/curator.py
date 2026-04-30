from __future__ import annotations

import csv
import hashlib
import json
from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace
from typing import Any

from src.integrations.prodigi.catalog_pipeline.parser import (
    CURATED_CSV_FIELDNAMES,
    curated_row_from_parsed,
)
from src.integrations.prodigi.catalog_pipeline.paths import resolve_curated_csv_path
from src.integrations.prodigi.catalog_pipeline.planner import ProdigiCatalogSnapshotPlanner
from src.integrations.prodigi.catalog_pipeline.raw_source import ProdigiRawCsvSource
from src.integrations.prodigi.services.prodigi_business_policy import (
    ProdigiBusinessPolicyService,
)
from src.integrations.prodigi.services.prodigi_catalog_preview import (
    DEFAULT_RATIO_PRESETS,
    PAPER_MATERIAL_OPTIONS,
    ProdigiCatalogPreviewService,
)
from src.integrations.prodigi.services.prodigi_fulfillment_policy import (
    ProdigiFulfillmentPolicyService,
)
from src.integrations.prodigi.services.prodigi_shipping_policy import ProdigiShippingPolicyService
from src.integrations.prodigi.services.prodigi_storefront_policy import (
    ProdigiStorefrontPolicyService,
)
from src.integrations.prodigi.services.sizing.selector import ProdigiSizeSelectorService

DEFAULT_MAX_CURATED_CSV_BYTES = 80 * 1024 * 1024


@dataclass(slots=True)
class ProdigiCuratedCsvBuildResult:
    status: str
    raw_root: str
    output_path: str
    raw_files_seen: int
    raw_rows_seen: int
    parsed_rows_seen: int
    relevant_rows_seen: int
    shortlisted_rows_seen: int
    curated_rows_written: int
    duplicate_route_rows: int
    output_size_bytes: int
    output_sha256: str
    max_size_bytes: int
    generated_at: str
    policy_version: str


class ProdigiCuratedCsvBuilder:
    """
    Dev-only zero layer: convert the large supplier CSV dump into a small,
    deterministic source file committed with the application.
    """

    def __init__(
        self,
        *,
        raw_csv_root: str | Path | None = None,
        output_path: str | Path | None = None,
    ):
        self.raw_source = ProdigiRawCsvSource(raw_csv_root)
        self.output_path = resolve_curated_csv_path(output_path)
        self.preview_service = ProdigiCatalogPreviewService(SimpleNamespace(session=None))
        self.storefront_policy = ProdigiStorefrontPolicyService()
        self.fulfillment_policy = ProdigiFulfillmentPolicyService()
        self.shipping_policy = ProdigiShippingPolicyService()
        self.category_defs = self._all_category_defs()
        self.selector = ProdigiSizeSelectorService(
            ratio_labels=[item["label"] for item in DEFAULT_RATIO_PRESETS]
        )
        self.planner = ProdigiCatalogSnapshotPlanner(
            category_defs=self.category_defs,
            selector=self.selector,
            preview_service=self.preview_service,
            storefront_policy=self.storefront_policy,
            fulfillment_policy=self.fulfillment_policy,
            shipping_policy=self.shipping_policy,
        )

    def build(
        self,
        *,
        max_size_bytes: int = DEFAULT_MAX_CURATED_CSV_BYTES,
        allow_large: bool = False,
    ) -> ProdigiCuratedCsvBuildResult:
        selected_rows_by_offer_key: dict[tuple[str, str, str, str, str], dict[str, Any]] = {}
        selected_ranks_by_offer_key: dict[tuple[str, str, str, str, str], tuple[Any, ...]] = {}
        raw_files_seen = 0
        raw_rows_seen = 0
        parsed_rows_seen = 0
        relevant_rows_seen = 0
        shortlisted_rows_seen = 0
        duplicate_route_rows = 0
        seen_files: set[str] = set()
        ratio_category_size_stats: dict[str, Any] = defaultdict(
            lambda: defaultdict(lambda: defaultdict(lambda: {"rows": 0, "countries": set()}))
        )
        country_size_presence: dict[str, Any] = defaultdict(
            lambda: defaultdict(lambda: defaultdict(set))
        )

        for record in self.raw_source.iter_records():
            raw_rows_seen += 1
            seen_files.add(str(record.file_path))
            candidate = self._candidate_from_raw(record.file_path, record.row)
            if candidate is None:
                continue
            parsed, category_id, ratio, dims = candidate
            parsed_rows_seen += 1
            relevant_rows_seen += 1
            destination_country = (parsed.get("destination_country") or "").upper()
            ratio_category_size_stats[ratio][category_id][dims]["rows"] += 1
            ratio_category_size_stats[ratio][category_id][dims]["countries"].add(
                destination_country
            )
            country_size_presence[ratio][destination_country][category_id].add(dims)

        size_plan = self.selector.build_size_plan_from_stats(
            ratio_category_size_stats=ratio_category_size_stats,
            country_size_presence=country_size_presence,
        )
        allowed_size_labels = self._build_allowed_size_labels(size_plan)

        for record in self.raw_source.iter_records():
            candidate = self._candidate_from_raw(record.file_path, record.row)
            if candidate is None:
                continue
            parsed, category_id, ratio, dims = candidate
            if dims.label not in allowed_size_labels.get((ratio, category_id), set()):
                continue
            shortlisted_rows_seen += 1
            destination_country = (parsed.get("destination_country") or "").upper()
            offer = self.planner.build_offer(parsed)
            tier = self.shipping_policy.normalize_tier(
                offer.get("shipping_method"),
                offer.get("service_level"),
            )
            offer_key = (ratio, category_id, dims.label, destination_country, tier)
            offer_rank = self.shipping_policy._offer_rank(offer, destination_country)
            curated_row = curated_row_from_parsed(parsed, category_id=category_id)
            existing_rank = selected_ranks_by_offer_key.get(offer_key)
            if existing_rank is not None:
                duplicate_route_rows += 1
                existing_row = selected_rows_by_offer_key[offer_key]
                if (offer_rank, self._stable_row_key(curated_row)) >= (
                    existing_rank,
                    self._stable_row_key(existing_row),
                ):
                    continue
            selected_rows_by_offer_key[offer_key] = curated_row
            selected_ranks_by_offer_key[offer_key] = offer_rank

        raw_files_seen = len(seen_files)
        rows = [
            selected_rows_by_offer_key[key]
            for key in sorted(selected_rows_by_offer_key)
        ]
        temp_path = self.output_path.with_suffix(f"{self.output_path.suffix}.tmp")
        self.output_path.parent.mkdir(parents=True, exist_ok=True)
        with temp_path.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=CURATED_CSV_FIELDNAMES)
            writer.writeheader()
            writer.writerows(rows)
        output_size = temp_path.stat().st_size
        if output_size > max_size_bytes and not allow_large:
            temp_path.unlink(missing_ok=True)
            raise RuntimeError(
                "Curated Prodigi CSV is larger than the configured safety limit: "
                f"{output_size} bytes > {max_size_bytes} bytes. Use --allow-large to override."
            )
        output_sha256 = self._sha256(temp_path)
        temp_path.replace(self.output_path)
        return ProdigiCuratedCsvBuildResult(
            status="written",
            raw_root=str(self.raw_source.csv_root),
            output_path=str(self.output_path),
            raw_files_seen=raw_files_seen,
            raw_rows_seen=raw_rows_seen,
            parsed_rows_seen=parsed_rows_seen,
            relevant_rows_seen=relevant_rows_seen,
            shortlisted_rows_seen=shortlisted_rows_seen,
            curated_rows_written=len(rows),
            duplicate_route_rows=duplicate_route_rows,
            output_size_bytes=output_size,
            output_sha256=output_sha256,
            max_size_bytes=max_size_bytes,
            generated_at=datetime.now(UTC).isoformat(),
            policy_version=ProdigiBusinessPolicyService.POLICY_VERSION,
        )

    def _all_category_defs(self) -> list[dict[str, Any]]:
        categories: list[dict[str, Any]] = []
        seen: set[tuple[str, str | None]] = set()
        for material in PAPER_MATERIAL_OPTIONS:
            for category in self.preview_service.get_category_defs(material["id"]):
                key = (category["id"], category.get("material"))
                if key in seen:
                    continue
                seen.add(key)
                categories.append(category)
        return categories

    def _stable_row_key(self, row: dict[str, Any]) -> str:
        return json.dumps(row, sort_keys=True, ensure_ascii=True, separators=(",", ":"))

    def _candidate_from_raw(
        self,
        file_path: Path,
        row: dict[str, Any],
    ) -> tuple[dict[str, Any], str, str, Any] | None:
        parsed = self.planner.parser.parse(file_path, row)
        if not parsed or not parsed.get("is_relevant_for_artshop"):
            return None
        category_id = self.planner.match_category_id(parsed)
        if category_id is None:
            return None
        parsed["category_id"] = category_id
        if not self.storefront_policy._matches_policy(category_id, parsed):
            return None
        if parsed.get("product_price") is None or parsed.get("shipping_price") is None:
            return None
        if not parsed.get("shipping_method") and not parsed.get("service_level"):
            return None
        if not (parsed.get("destination_country") or "").strip():
            return None
        ratio = self.selector.match_ratio(
            parsed.get("size_cm"),
            parsed.get("size_inches"),
        )
        dims = self.selector.parse_size_dims(
            parsed.get("size_cm"),
            parsed.get("size_inches"),
        )
        if ratio is None or dims is None:
            return None
        return parsed, category_id, ratio, dims

    def _build_allowed_size_labels(self, size_plan: dict[str, Any]) -> dict[tuple[str, str], set[str]]:
        allowed: dict[tuple[str, str], set[str]] = defaultdict(set)
        for ratio, category_map in size_plan.get("global_shortlists", {}).items():
            for category_id, slots in category_map.items():
                for slot in slots:
                    allowed[(ratio, category_id)].update(slot.get("member_size_labels") or [])
        return allowed

    def _sha256(self, path: Path) -> str:
        digest = hashlib.sha256()
        with path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()
