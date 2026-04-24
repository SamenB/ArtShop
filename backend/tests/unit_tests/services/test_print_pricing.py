from __future__ import annotations

import pytest

from src.services.print_pricing import PrintPricingService


class FakeAspectRatioRepository:
    def __init__(self, rows=None):
        self.rows = list(rows or [])

    async def get_all_ordered(self):
        return sorted(self.rows, key=lambda row: (row.sort_order, row.label))


class FakeSession:
    def __init__(self, repository: FakeAspectRatioRepository):
        self.repository = repository
        self._next_id = 1

    def add(self, row):
        row.id = self._next_id
        self._next_id += 1
        self.repository.rows.append(row)

    async def commit(self):
        return None

    async def rollback(self):
        return None


class FakeDB:
    def __init__(self, rows=None):
        self.aspect_ratios = FakeAspectRatioRepository(rows)
        self.session = FakeSession(self.aspect_ratios)


@pytest.mark.asyncio
async def test_get_all_aspect_ratios_seeds_default_presets_when_catalog_is_empty():
    service = PrintPricingService(FakeDB())

    ratios = await service.get_all_aspect_ratios()

    assert [ratio.label for ratio in ratios] == ["4:5", "1:1", "2:3", "3:4", "5:7"]
    assert ratios[0].description == "Primary gallery ratio for most flagship works."
