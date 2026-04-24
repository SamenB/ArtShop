from __future__ import annotations

import re
from collections import defaultdict
from typing import Any

from src.services.prodigi_sizing.models import SizeCluster, SizeDims, SizePoint

SIZE_PATTERN = re.compile(r"(?P<w>\d+(?:\.\d+)?)x(?P<h>\d+(?:\.\d+)?)")
RATIO_TOLERANCE = 0.02
DEFAULT_CLUSTER_TOLERANCE_CM = 2.0
DEFAULT_MIN_SHORT_EDGE_GAP_CM = 9.0
DEFAULT_MAX_SHORTLIST_ITEMS = 8


class ProdigiSizeSelectorService:
    """
    Pure business-logic service for size normalization and shortlist selection.
    """

    def __init__(
        self,
        ratio_labels: list[str],
        cluster_tolerance_cm: float = DEFAULT_CLUSTER_TOLERANCE_CM,
        min_short_edge_gap_cm: float = DEFAULT_MIN_SHORT_EDGE_GAP_CM,
        max_shortlist_items: int = DEFAULT_MAX_SHORTLIST_ITEMS,
    ):
        self.ratio_labels = ratio_labels
        self.cluster_tolerance_cm = cluster_tolerance_cm
        self.min_short_edge_gap_cm = min_short_edge_gap_cm
        self.max_shortlist_items = max_shortlist_items

    def build_size_plan(self, rows: list[dict[str, Any]]) -> dict[str, Any]:
        ratio_category_size_stats: dict[str, dict[str, dict[SizeDims, dict[str, Any]]]] = (
            defaultdict(
                lambda: defaultdict(lambda: defaultdict(lambda: {"rows": 0, "countries": set()}))
            )
        )
        country_size_presence: dict[str, dict[str, dict[str, set[SizeDims]]]] = defaultdict(
            lambda: defaultdict(lambda: defaultdict(set))
        )

        for row in rows:
            category_id = row.get("category_id")
            if not category_id:
                continue

            ratio = self.match_ratio(row.get("size_cm"), row.get("size_inches"))
            dims = self.parse_size_dims(row.get("size_cm"), row.get("size_inches"))
            country_code = (row.get("destination_country") or "").upper()
            if ratio is None or dims is None or not country_code:
                continue

            ratio_category_size_stats[ratio][category_id][dims]["rows"] += 1
            ratio_category_size_stats[ratio][category_id][dims]["countries"].add(country_code)
            country_size_presence[ratio][country_code][category_id].add(dims)

        return self.build_size_plan_from_stats(
            ratio_category_size_stats=ratio_category_size_stats,
            country_size_presence=country_size_presence,
        )

    def build_size_plan_from_stats(
        self,
        *,
        ratio_category_size_stats: dict[str, dict[str, dict[SizeDims, dict[str, Any]]]],
        country_size_presence: dict[str, dict[str, dict[str, set[SizeDims]]]],
    ) -> dict[str, Any]:
        global_shortlists: dict[str, dict[str, list[dict[str, Any]]]] = defaultdict(dict)
        country_shortlists: dict[str, dict[str, dict[str, list[dict[str, Any]]]]] = defaultdict(
            lambda: defaultdict(dict)
        )

        for ratio in self.ratio_labels:
            for category_id, size_map in ratio_category_size_stats.get(ratio, {}).items():
                clusters = self._cluster_sizes(
                    ratio=ratio, category_id=category_id, size_map=size_map
                )
                shortlist = self._select_shortlist(clusters)
                global_shortlists[ratio][category_id] = [
                    self._serialize_cluster(item) for item in shortlist
                ]

                for country_code, category_map in country_size_presence.get(ratio, {}).items():
                    available_sizes = category_map.get(category_id, set())
                    country_shortlists[ratio][country_code][category_id] = [
                        self._serialize_country_slot(cluster, available_sizes)
                        for cluster in shortlist
                    ]

        return {
            "global_shortlists": global_shortlists,
            "country_shortlists": country_shortlists,
        }

    def parse_size_dims(self, size_cm: str | None, size_inches: str | None) -> SizeDims | None:
        for candidate, is_inches in ((size_cm, False), (size_inches, True)):
            if not candidate:
                continue
            normalized = candidate.lower().replace("×", "x").replace('"', "").strip()
            match = SIZE_PATTERN.search(normalized)
            if not match:
                continue

            width = float(match.group("w"))
            height = float(match.group("h"))
            if is_inches:
                width *= 2.54
                height *= 2.54

            short_edge, long_edge = sorted((round(width, 1), round(height, 1)))
            return SizeDims(short_edge, long_edge)
        return None

    def match_ratio(self, size_cm: str | None, size_inches: str | None) -> str | None:
        dims = self.parse_size_dims(size_cm=size_cm, size_inches=size_inches)
        if dims is None:
            return None

        actual_ratio = dims.short_cm / dims.long_cm if dims.long_cm else 0
        best_ratio: str | None = None
        best_delta: float | None = None

        for label in self.ratio_labels:
            left, right = label.split(":")
            target_ratio = int(left) / int(right)
            delta = abs(actual_ratio - target_ratio)
            if best_delta is None or delta < best_delta:
                best_delta = delta
                best_ratio = label

        if best_delta is not None and best_delta <= RATIO_TOLERANCE:
            return best_ratio
        return None

    def _cluster_sizes(
        self,
        ratio: str,
        category_id: str,
        size_map: dict[SizeDims, dict[str, Any]],
    ) -> list[SizeCluster]:
        raw_clusters: list[list[SizePoint]] = []

        sorted_points = sorted(
            (
                SizePoint(
                    dims=dims,
                    row_count=stats["rows"],
                    country_count=len(stats["countries"]),
                )
                for dims, stats in size_map.items()
            ),
            key=lambda point: (point.dims.area, point.dims.long_cm, point.dims.short_cm),
        )

        for point in sorted_points:
            matched_cluster: list[SizePoint] | None = None
            for cluster in raw_clusters:
                if any(
                    abs(point.dims.short_cm - item.dims.short_cm) <= self.cluster_tolerance_cm
                    and abs(point.dims.long_cm - item.dims.long_cm) <= self.cluster_tolerance_cm
                    for item in cluster
                ):
                    matched_cluster = cluster
                    break

            if matched_cluster is None:
                raw_clusters.append([point])
            else:
                matched_cluster.append(point)

        clusters: list[SizeCluster] = []
        for cluster_points in raw_clusters:
            centroid = self._compute_centroid(cluster_points)
            recommended = self._choose_nearest_real_size(cluster_points, centroid)
            strongest = self._choose_strongest_size(cluster_points)
            member_sizes = sorted(
                [point.dims for point in cluster_points],
                key=lambda item: (item.area, item.long_cm, item.short_cm),
            )
            score = sum(point.country_count for point in cluster_points)
            row_count = sum(point.row_count for point in cluster_points)
            country_count = max(point.country_count for point in cluster_points)

            clusters.append(
                SizeCluster(
                    ratio=ratio,
                    category_id=category_id,
                    centroid=centroid,
                    recommended_size=recommended.dims,
                    strongest_size=strongest.dims,
                    member_sizes=member_sizes,
                    score=score,
                    row_count=row_count,
                    country_count=country_count,
                )
            )

        return sorted(
            clusters,
            key=lambda item: (
                item.recommended_size.short_cm,
                item.recommended_size.long_cm,
            ),
        )

    def _select_shortlist(self, clusters: list[SizeCluster]) -> list[SizeCluster]:
        if not clusters:
            return []

        selected: list[SizeCluster] = []
        for cluster in sorted(clusters, key=lambda item: item.recommended_size.short_cm):
            if not selected:
                selected.append(cluster)
                continue

            previous = selected[-1]
            gap = cluster.recommended_size.short_cm - previous.recommended_size.short_cm
            if gap >= self.min_short_edge_gap_cm:
                selected.append(cluster)
                continue

            selected[-1] = self._prefer_cluster(previous, cluster)

        while len(selected) > self.max_shortlist_items:
            weakest_index = min(
                range(len(selected)),
                key=lambda idx: (
                    selected[idx].country_count,
                    selected[idx].score,
                    selected[idx].row_count,
                ),
            )
            if weakest_index == 0:
                selected.pop(0)
            elif weakest_index == len(selected) - 1:
                selected.pop()
            else:
                left_gap = (
                    selected[weakest_index].recommended_size.short_cm
                    - selected[weakest_index - 1].recommended_size.short_cm
                )
                right_gap = (
                    selected[weakest_index + 1].recommended_size.short_cm
                    - selected[weakest_index].recommended_size.short_cm
                )
                if left_gap <= right_gap:
                    selected.pop(weakest_index)
                else:
                    selected.pop(weakest_index)

        return selected

    def _prefer_cluster(self, left: SizeCluster, right: SizeCluster) -> SizeCluster:
        ranked = sorted(
            (left, right),
            key=lambda item: (
                -item.country_count,
                -item.score,
                -item.row_count,
                -self._size_clean_score(item.recommended_size),
                item.recommended_size.area,
            ),
        )
        return ranked[0]

    def _compute_centroid(self, points: list[SizePoint]) -> SizeDims:
        total_weight = sum(point.country_count for point in points) or len(points)
        short_center = (
            sum(point.dims.short_cm * point.country_count for point in points) / total_weight
        )
        long_center = (
            sum(point.dims.long_cm * point.country_count for point in points) / total_weight
        )
        return SizeDims(round(short_center, 1), round(long_center, 1))

    def _choose_nearest_real_size(self, points: list[SizePoint], centroid: SizeDims) -> SizePoint:
        ranked = sorted(
            points,
            key=lambda point: (
                self._distance(point.dims, centroid),
                -point.country_count,
                -point.row_count,
                -self._size_clean_score(point.dims),
                point.dims.area,
            ),
        )
        return ranked[0]

    def _choose_strongest_size(self, points: list[SizePoint]) -> SizePoint:
        ranked = sorted(
            points,
            key=lambda point: (
                -point.country_count,
                -point.row_count,
                -self._size_clean_score(point.dims),
                point.dims.area,
            ),
        )
        return ranked[0]

    def _serialize_cluster(self, cluster: SizeCluster) -> dict[str, Any]:
        return {
            "recommended_size_label": cluster.recommended_size.label,
            "strongest_size_label": cluster.strongest_size.label,
            "centroid_size_label": cluster.centroid.label,
            "member_size_labels": [item.label for item in cluster.member_sizes],
            "country_count": cluster.country_count,
            "score": cluster.score,
            "row_count": cluster.row_count,
        }

    def _serialize_country_slot(
        self,
        cluster: SizeCluster,
        available_sizes: set[SizeDims],
    ) -> dict[str, Any]:
        available_members = [size for size in cluster.member_sizes if size in available_sizes]
        if available_members:
            exact_size = sorted(
                available_members,
                key=lambda size: (
                    self._distance(size, cluster.centroid),
                    abs(size.short_cm - cluster.recommended_size.short_cm),
                    abs(size.long_cm - cluster.recommended_size.long_cm),
                    -self._size_clean_score(size),
                    size.area,
                ),
            )[0]
            return {
                "slot_size_label": cluster.recommended_size.label,
                "size_label": exact_size.label,
                "available": True,
                "centroid_size_label": cluster.centroid.label,
                "member_size_labels": [item.label for item in cluster.member_sizes],
                "country_count": cluster.country_count,
            }

        return {
            "slot_size_label": cluster.recommended_size.label,
            "size_label": cluster.recommended_size.label,
            "available": False,
            "centroid_size_label": cluster.centroid.label,
            "member_size_labels": [item.label for item in cluster.member_sizes],
            "country_count": cluster.country_count,
        }

    def _distance(self, left: SizeDims, right: SizeDims) -> float:
        return ((left.short_cm - right.short_cm) ** 2 + (left.long_cm - right.long_cm) ** 2) ** 0.5

    def _size_clean_score(self, size: SizeDims) -> int:
        return self._edge_clean_score(size.short_cm) + self._edge_clean_score(size.long_cm)

    def _edge_clean_score(self, value: float) -> int:
        rounded = round(value)
        if abs(value - rounded) < 0.06:
            if rounded % 5 == 0:
                return 5
            return 4

        fractional = abs(value - int(value))
        if any(abs(fractional - target) < 0.06 for target in (0.5, 0.25, 0.75)):
            return 2
        if any(
            abs(fractional - target) < 0.06 for target in (0.1, 0.2, 0.3, 0.4, 0.6, 0.7, 0.8, 0.9)
        ):
            return 1
        return 0
