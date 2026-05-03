from __future__ import annotations

import csv
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterator

from src.integrations.prodigi.catalog_pipeline.paths import resolve_raw_csv_root


def resolve_prodigi_csv_root(
    csv_root: str | Path | None = None,
    *,
    require_exists: bool = True,
) -> Path:
    """Backward-compatible alias for the dev-only raw CSV root resolver."""
    return resolve_raw_csv_root(csv_root, require_exists=require_exists)


@dataclass(frozen=True, slots=True)
class ProdigiCsvRecord:
    file_path: Path
    row: dict[str, Any]


@dataclass(slots=True)
class ProdigiCsvSourceStats:
    root: str
    files_seen: int = 0
    rows_seen: int = 0


class ProdigiCsvSource:
    """Backward-compatible raw CSV source. Runtime code should use curated_source."""

    def __init__(self, csv_root: str | Path | None = None):
        self.csv_root = resolve_prodigi_csv_root(csv_root)

    def discover_csv_files(self) -> list[Path]:
        files = sorted(self.csv_root.rglob("*.csv"))
        if not files:
            raise FileNotFoundError(f"No Prodigi CSV files found under {self.csv_root}")
        return files

    def iter_records(self) -> Iterator[ProdigiCsvRecord]:
        for file_path in self.discover_csv_files():
            with file_path.open("r", encoding="utf-8-sig", newline="") as handle:
                reader = csv.DictReader(handle)
                for row in reader:
                    yield ProdigiCsvRecord(file_path=file_path, row=row)

    def describe(self) -> ProdigiCsvSourceStats:
        files = self.discover_csv_files()
        rows_seen = 0
        for file_path in files:
            with file_path.open("r", encoding="utf-8-sig", newline="") as handle:
                rows_seen += sum(1 for _ in csv.DictReader(handle))
        return ProdigiCsvSourceStats(
            root=str(self.csv_root),
            files_seen=len(files),
            rows_seen=rows_seen,
        )
