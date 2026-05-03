from __future__ import annotations

from typing import Any

# Commercial priority order for storefront review.
# This is not meant to be exact macroeconomic truth; it is a practical
# merchandising order for the admin UI so the most commercially relevant
# countries appear first.
PRIORITY_COUNTRY_ORDER = [
    "US",
    "DE",
    "GB",
    "FR",
    "CA",
    "AU",
    "NL",
    "CH",
    "AT",
    "BE",
    "DK",
    "SE",
    "NO",
    "IE",
    "IT",
    "ES",
    "JP",
    "SG",
    "NZ",
    "AE",
    "PL",
    "PT",
    "FI",
    "LU",
    "CZ",
    "KR",
    "HK",
    "TW",
    "IL",
    "SA",
    "MX",
    "PR",
    "GR",
    "HU",
    "RO",
    "SK",
    "SI",
    "HR",
    "EE",
    "LV",
    "LT",
    "MT",
    "CY",
    "UA",
    "TR",
    "ZA",
    "BR",
    "AR",
    "CL",
    "CO",
]

PRIORITY_RANK = {
    country_code: index + 1 for index, country_code in enumerate(PRIORITY_COUNTRY_ORDER)
}


def get_market_priority(country_code: str) -> dict[str, Any]:
    normalized = (country_code or "").upper()
    rank = PRIORITY_RANK.get(normalized, 999)

    if rank <= 8:
        segment = "core"
    elif rank <= 20:
        segment = "focus"
    elif rank <= 40:
        segment = "expansion"
    else:
        segment = "long_tail"

    return {
        "rank": rank,
        "segment": segment,
        "is_priority": rank != 999,
    }
