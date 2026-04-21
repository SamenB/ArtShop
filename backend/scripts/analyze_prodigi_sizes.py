"""
Analyze imported Prodigi catalog sizes and suggest a cleaner storefront size grid.

This script works on top of the same repository + sizing-service stack used by
the admin preview. It:
1. normalizes horizontal/vertical duplicates into one canonical size pair,
2. matches each supplier size to one of our approved aspect ratios,
3. clusters near-duplicate sizes within a configurable tolerance,
4. ranks clusters by country/category coverage,
5. picks a statistically reliable real supplier size near the cluster center.

Example:
    python backend/scripts/analyze_prodigi_sizes.py --top 12 --csv backend/temp/prodigi_sizes.csv
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import re
import sys
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))


SIZE_RE = re.compile(r"(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)")
DEFAULT_PAPER_MATERIAL_ID = "hahnemuhle_german_etching"


@dataclass(frozen=True)
class SizeDims:
    short_cm: float
    long_cm: float

    @property
    def label(self) -> str:
        return f"{self.short_cm:g}x{self.long_cm:g}"

    @property
    def area(self) -> float:
        return self.short_cm * self.long_cm


@dataclass
class SizeMetrics:
    rows: int
    categories: set[str]
    countries: set[str]
    score: int


@dataclass
class ClusterSummary:
    ratio: str
    recommended_supplier_size: SizeDims
    strongest_supplier_size: SizeDims
    centroid_size: SizeDims
    member_sizes: list[SizeDims]
    score: int
    rows: int
    category_count: int
    country_count: int


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Analyze Prodigi sizes for storefront standardization."
    )
    parser.add_argument(
        "--paper-material",
        default=DEFAULT_PAPER_MATERIAL_ID,
        help="Normalized paper material used by the curated preview filter.",
    )
    parser.add_argument(
        "--top",
        type=int,
        default=12,
        help="How many top clusters to show per aspect ratio.",
    )
    parser.add_argument(
        "--tolerance-cm",
        type=float,
        default=2.0,
        help="Maximum per-edge distance for near-duplicate clustering.",
    )
    parser.add_argument(
        "--csv",
        type=Path,
        default=None,
        help="Optional CSV output path for downstream spreadsheet/chart work.",
    )
    return parser.parse_args()


def parse_size_dims(size_cm: str | None, size_inches: str | None) -> SizeDims | None:
    for candidate, is_inches in ((size_cm, False), (size_inches, True)):
        if not candidate:
            continue
        normalized = candidate.lower().replace("×", "x").replace('"', "").strip()
        match = SIZE_RE.search(normalized)
        if not match:
            continue

        width = float(match.group(1))
        height = float(match.group(2))
        if is_inches:
            width *= 2.54
            height *= 2.54

        short_edge, long_edge = sorted((round(width, 1), round(height, 1)))
        return SizeDims(short_edge, long_edge)
    return None


def edge_clean_score(value: float) -> int:
    rounded = round(value)
    if abs(value - rounded) < 0.06:
        if rounded % 5 == 0:
            return 5
        return 4

    fractional = abs(value - int(value))
    if any(abs(fractional - target) < 0.06 for target in (0.5, 0.25, 0.75)):
        return 2
    if any(abs(fractional - target) < 0.06 for target in (0.1, 0.2, 0.3, 0.4, 0.6, 0.7, 0.8, 0.9)):
        return 1
    return 0


def size_clean_score(size: SizeDims) -> int:
    return edge_clean_score(size.short_cm) + edge_clean_score(size.long_cm)


def compute_weighted_centroid(members: list[tuple[SizeDims, SizeMetrics]]) -> SizeDims:
    total_weight = sum(metrics.score for _, metrics in members) or len(members)
    short_center = sum(dims.short_cm * metrics.score for dims, metrics in members) / total_weight
    long_center = sum(dims.long_cm * metrics.score for dims, metrics in members) / total_weight
    return SizeDims(round(short_center, 1), round(long_center, 1))


def centroid_distance(size: SizeDims, centroid: SizeDims) -> float:
    return (
        (size.short_cm - centroid.short_cm) ** 2 + (size.long_cm - centroid.long_cm) ** 2
    ) ** 0.5


def choose_recommended_supplier_size(
    members: list[tuple[SizeDims, SizeMetrics]],
    centroid: SizeDims,
) -> tuple[SizeDims, SizeMetrics]:
    ranked = sorted(
        members,
        key=lambda item: (
            centroid_distance(item[0], centroid),
            -item[1].score,
            -len(item[1].categories),
            -len(item[1].countries),
            -size_clean_score(item[0]),
            item[0].area,
        ),
    )
    return ranked[0]


def choose_strongest_supplier_size(
    members: list[tuple[SizeDims, SizeMetrics]],
) -> tuple[SizeDims, SizeMetrics]:
    ranked = sorted(
        members,
        key=lambda item: (
            -item[1].score,
            -len(item[1].categories),
            -len(item[1].countries),
            -size_clean_score(item[0]),
            item[0].area,
        ),
    )
    return ranked[0]


def build_clusters(
    ratio: str,
    items: dict[SizeDims, SizeMetrics],
    tolerance_cm: float,
) -> list[ClusterSummary]:
    raw_clusters: list[list[tuple[SizeDims, SizeMetrics]]] = []

    for dims, metrics in sorted(
        items.items(), key=lambda item: (item[0].area, item[0].long_cm, item[0].short_cm)
    ):
        matched_cluster: list[tuple[SizeDims, SizeMetrics]] | None = None
        for cluster in raw_clusters:
            if any(
                abs(dims.short_cm - existing.short_cm) <= tolerance_cm
                and abs(dims.long_cm - existing.long_cm) <= tolerance_cm
                for existing, _ in cluster
            ):
                matched_cluster = cluster
                break

        if matched_cluster is None:
            raw_clusters.append([(dims, metrics)])
        else:
            matched_cluster.append((dims, metrics))

    summaries: list[ClusterSummary] = []
    for cluster in raw_clusters:
        strongest_size, _ = choose_strongest_supplier_size(cluster)
        centroid = compute_weighted_centroid(cluster)
        recommended_size, _ = choose_recommended_supplier_size(cluster, centroid)

        all_categories: set[str] = set()
        all_countries: set[str] = set()
        total_rows = 0
        total_score = 0
        member_sizes: list[SizeDims] = []

        for dims, metrics in cluster:
            member_sizes.append(dims)
            all_categories |= metrics.categories
            all_countries |= metrics.countries
            total_rows += metrics.rows
            total_score += metrics.score

        summaries.append(
            ClusterSummary(
                ratio=ratio,
                recommended_supplier_size=recommended_size,
                strongest_supplier_size=strongest_size,
                centroid_size=centroid,
                member_sizes=sorted(
                    member_sizes, key=lambda item: (item.area, item.long_cm, item.short_cm)
                ),
                score=total_score,
                rows=total_rows,
                category_count=len(all_categories),
                country_count=len(all_countries),
            )
        )

    summaries.sort(
        key=lambda item: (
            -item.score,
            -item.category_count,
            -item.country_count,
            item.recommended_supplier_size.area,
        )
    )
    return summaries


async def collect_clusters(
    paper_material: str,
    tolerance_cm: float,
) -> dict[str, list[ClusterSummary]]:
    from src.database import new_session
    from src.repositories.prodigi_catalog import ProdigiCatalogRepository
    from src.services.prodigi_catalog_preview import (
        DEFAULT_RATIO_PRESETS,
        ProdigiCatalogPreviewService,
    )
    from src.services.prodigi_sizing.selector import ProdigiSizeSelectorService
    from src.services.prodigi_storefront_policy import ProdigiStorefrontPolicyService
    from src.utils.db_manager import DBManager

    ratio_labels = [item["label"] for item in DEFAULT_RATIO_PRESETS]

    async with DBManager(session_factory=new_session) as db:
        service = ProdigiCatalogPreviewService(db)
        repository = ProdigiCatalogRepository(db.session)
        selector = ProdigiSizeSelectorService(ratio_labels=ratio_labels)
        policy_service = ProdigiStorefrontPolicyService()
        categories = service.get_category_defs(paper_material)
        rows = await repository.get_curated_rows(categories)
        rows = policy_service.apply(rows)["rows"]

        ratio_sizes: dict[str, dict[SizeDims, dict[str, Any]]] = defaultdict(
            lambda: defaultdict(
                lambda: {
                    "rows": 0,
                    "categories": set(),
                    "countries": set(),
                    "by_category_countries": defaultdict(set),
                }
            )
        )

        for row in rows:
            dims = parse_size_dims(row.get("size_cm"), row.get("size_inches"))
            if dims is None:
                continue

            ratio = selector.match_ratio(row.get("size_cm"), row.get("size_inches"))
            if ratio is None:
                continue

            category_id = row["category_id"]
            country_code = (row.get("destination_country") or "").upper()
            bucket = ratio_sizes[ratio][dims]
            bucket["rows"] += 1
            bucket["categories"].add(category_id)
            if country_code:
                bucket["countries"].add(country_code)
                bucket["by_category_countries"][category_id].add(country_code)

        summaries_by_ratio: dict[str, list[ClusterSummary]] = {}
        for ratio in ratio_labels:
            items: dict[SizeDims, SizeMetrics] = {}
            for dims, raw_metrics in ratio_sizes.get(ratio, {}).items():
                score = sum(
                    len(countries) for countries in raw_metrics["by_category_countries"].values()
                )
                items[dims] = SizeMetrics(
                    rows=raw_metrics["rows"],
                    categories=set(raw_metrics["categories"]),
                    countries=set(raw_metrics["countries"]),
                    score=score,
                )

            summaries_by_ratio[ratio] = build_clusters(
                ratio=ratio, items=items, tolerance_cm=tolerance_cm
            )

        return summaries_by_ratio


def print_report(summaries_by_ratio: dict[str, list[ClusterSummary]], top: int) -> None:
    for ratio, summaries in summaries_by_ratio.items():
        print(f"\n===== {ratio} =====")
        for summary in summaries[:top]:
            members = ", ".join(size.label for size in summary.member_sizes)
            print(
                f"recommended={summary.recommended_supplier_size.label:<9} "
                f"best_supplier={summary.strongest_supplier_size.label:<9} "
                f"centroid={summary.centroid_size.label:<11} "
                f"score={summary.score:<4} "
                f"cats={summary.category_count:<2} "
                f"countries={summary.country_count:<3} "
                f"rows={summary.rows:<5} "
                f"members=[{members}]"
            )


def write_csv(summaries_by_ratio: dict[str, list[ClusterSummary]], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", newline="", encoding="utf-8") as file:
        writer = csv.writer(file)
        writer.writerow(
            [
                "ratio",
                "recommended_supplier_size",
                "strongest_supplier_size",
                "centroid_size",
                "score",
                "category_count",
                "country_count",
                "rows",
                "member_sizes",
            ]
        )
        for ratio, summaries in summaries_by_ratio.items():
            for summary in summaries:
                writer.writerow(
                    [
                        ratio,
                        summary.recommended_supplier_size.label,
                        summary.strongest_supplier_size.label,
                        summary.centroid_size.label,
                        summary.score,
                        summary.category_count,
                        summary.country_count,
                        summary.rows,
                        " | ".join(size.label for size in summary.member_sizes),
                    ]
                )


async def async_main(args: argparse.Namespace) -> None:
    summaries_by_ratio = await collect_clusters(
        paper_material=args.paper_material,
        tolerance_cm=args.tolerance_cm,
    )
    print_report(summaries_by_ratio=summaries_by_ratio, top=args.top)
    if args.csv:
        write_csv(summaries_by_ratio=summaries_by_ratio, output_path=args.csv)
        print(f"\nCSV written to: {args.csv}")


def main() -> None:
    args = parse_args()
    asyncio.run(async_main(args))


if __name__ == "__main__":
    main()
