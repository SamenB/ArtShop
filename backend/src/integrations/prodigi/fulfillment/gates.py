from __future__ import annotations

from collections.abc import Iterable

PASSED = "passed"
FAILED = "failed"
SKIPPED = "skipped"
PENDING = "pending"
BLOCKED = "blocked"


def aggregate_gate_status(statuses: Iterable[str]) -> str:
    values = list(statuses)
    if not values:
        return PENDING
    if any(status == FAILED for status in values):
        return FAILED
    if any(status == BLOCKED for status in values):
        return BLOCKED
    if all(status in {PASSED, SKIPPED} for status in values):
        return PASSED
    return PENDING


def is_green_status(status: str | None) -> bool:
    return status in {PASSED, SKIPPED}
