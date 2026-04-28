from __future__ import annotations

from dataclasses import dataclass


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
class SizePoint:
    dims: SizeDims
    row_count: int
    country_count: int


@dataclass
class SizeCluster:
    ratio: str
    category_id: str
    centroid: SizeDims
    recommended_size: SizeDims
    strongest_size: SizeDims
    member_sizes: list[SizeDims]
    score: int
    row_count: int
    country_count: int
