from datetime import UTC, datetime
from types import SimpleNamespace

from src.integrations.prodigi.services.prodigi_storefront_snapshot import (
    ProdigiStorefrontSnapshotService,
)


def make_size(
    *,
    slot_size_label: str,
    size_label: str,
    source_country: str,
    total_cost: float,
) -> SimpleNamespace:
    return SimpleNamespace(
        slot_size_label=slot_size_label,
        size_label=size_label,
        available=True,
        sku=f"SKU-{slot_size_label}",
        source_country=source_country,
        currency="EUR",
        product_price=total_cost - 10,
        shipping_price=10,
        total_cost=total_cost,
        delivery_days="2-4 days",
        default_shipping_tier="express",
        shipping_method="Express",
        service_name="Express",
        service_level="EXPRESS",
        shipping_profiles=[
            {
                "tier": "express",
                "shipping_method": "Express",
                "service_name": "Express",
                "service_level": "EXPRESS",
                "source_country": source_country,
                "currency": "EUR",
                "product_price": total_cost - 10,
                "shipping_price": 10,
                "total_cost": total_cost,
                "delivery_days": "2-4 days",
                "min_shipping_days": 2,
                "max_shipping_days": 4,
            }
        ],
    )


def make_group(
    *,
    country_code: str,
    country_name: str,
    category_id: str,
    sizes: list[SimpleNamespace],
) -> SimpleNamespace:
    return SimpleNamespace(
        destination_country=country_code,
        destination_country_name=country_name,
        category_id=category_id,
        category_label="Canvas Stretched",
        material_label="Standard Canvas",
        frame_label="38mm stretched canvas",
        storefront_action="show",
        fulfillment_level="local",
        geography_scope="domestic",
        tax_risk="low",
        source_countries=[country_code],
        fastest_delivery_days="2-4 days",
        available_shipping_tiers=["express", "standard"],
        default_shipping_tier="express",
        available_size_count=len(sizes),
        currency="EUR",
        min_total_cost=min(size.total_cost for size in sizes),
        max_total_cost=max(size.total_cost for size in sizes),
        fixed_attributes={},
        recommended_defaults={"wrap": "MirrorWrap"},
        allowed_attributes={"color": ["black"]},
        sizes=sizes,
    )


def test_snapshot_builds_country_matrix_with_missing_slots() -> None:
    service = ProdigiStorefrontSnapshotService(SimpleNamespace(session=None))
    bake = SimpleNamespace(
        id=1,
        bake_key="test-bake",
        paper_material="hahnemuhle_german_etching",
        include_notice_level=True,
        status="ready",
        ratio_count=1,
        country_count=2,
        offer_group_count=2,
        offer_size_count=3,
        created_at=datetime.now(UTC),
    )
    groups = [
        make_group(
            country_code="DE",
            country_name="Germany",
            category_id="canvasStretched",
            sizes=[
                make_size(
                    slot_size_label="20x25", size_label="20x25", source_country="DE", total_cost=40
                ),
                make_size(
                    slot_size_label="40x50", size_label="40x50", source_country="DE", total_cost=70
                ),
            ],
        ),
        make_group(
            country_code="US",
            country_name="United States",
            category_id="canvasStretched",
            sizes=[
                make_size(
                    slot_size_label="20x25", size_label="20x25", source_country="US", total_cost=50
                ),
            ],
        ),
    ]

    payload = service._build_ratio_visualization(
        bake=bake,
        selected_ratio="4:5",
        ratio_options=[
            {
                "ratio_label": "4:5",
                "ratio_title": "Core Portrait",
                "group_count": 2,
                "country_count": 2,
            }
        ],
        groups=groups,
    )

    assert payload["categories"][0]["baseline_size_labels"] == ["20x25", "40x50"]
    us_row = next(item for item in payload["countries"] if item["country_code"] == "US")
    us_cell = us_row["category_cells"][0]
    assert us_cell["size_entries"][0]["available"] is True
    assert us_cell["size_entries"][0]["sku"] == "SKU-20x25"
    assert us_cell["size_entries"][0]["product_price"] == 40.0
    assert us_cell["size_entries"][0]["shipping_price"] == 10.0
    assert us_cell["size_entries"][1]["available"] is False
    assert us_cell["size_entries"][1]["sku"] is None
    assert us_cell["default_shipping_tier"] == "express"
    assert us_cell["size_entries"][0]["shipping_profiles"][0]["tier"] == "express"
    assert us_cell["size_entries"][0]["shipping_support"]["status"] == "covered"
    assert us_cell["shipping_support"]["status"] == "covered"
