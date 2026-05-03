from __future__ import annotations

import csv
import hashlib
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator

from src.integrations.prodigi.catalog_pipeline.paths import resolve_curated_csv_path
from src.integrations.prodigi.catalog_pipeline.source import ProdigiCsvRecord


@dataclass(slots=True)
class ProdigiCuratedCsvSourceStats:
    path: str
    files_seen: int = 1
    rows_seen: int = 0
    size_bytes: int = 0
    sha256: str | None = None


class ProdigiCuratedCsvSource:
    """Runtime source for committed, filtered Prodigi storefront CSV rows."""

    def __init__(self, csv_path: str | Path | None = None):
        self.csv_path = resolve_curated_csv_path(csv_path)

    def discover_csv_files(self) -> list[Path]:
        if not self.csv_path.exists():
            raise FileNotFoundError(
                "Curated Prodigi CSV source does not exist. Generate it with "
                "python -m src.integrations.prodigi.tasks.prodigi_prepare_storefront_source. "
                f"Resolved path: {self.csv_path}"
            )
        if not self.csv_path.is_file():
            raise FileNotFoundError(f"Curated Prodigi CSV path is not a file: {self.csv_path}")
        return [self.csv_path]

    def iter_records(self) -> Iterator[ProdigiCsvRecord]:
        for file_path in self.discover_csv_files():
            with file_path.open("r", encoding="utf-8-sig", newline="") as handle:
                reader = csv.DictReader(handle)
                for row in reader:
                    yield ProdigiCsvRecord(file_path=file_path, row=row)

    def describe(self) -> ProdigiCuratedCsvSourceStats:
        files = self.discover_csv_files()
        rows_seen = 0
        for file_path in files:
            with file_path.open("r", encoding="utf-8-sig", newline="") as handle:
                rows_seen += sum(1 for _ in csv.DictReader(handle))
        return ProdigiCuratedCsvSourceStats(
            path=str(self.csv_path),
            files_seen=len(files),
            rows_seen=rows_seen,
            size_bytes=self.csv_path.stat().st_size,
            sha256=self.sha256(),
        )

    def sha256(self) -> str:
        digest = hashlib.sha256()
        with self.csv_path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()
