from types import SimpleNamespace

from src.services.prodigi_storefront_bake import ProdigiStorefrontBakeService


def make_preview_payload(storefront_action: str) -> dict:
    return {
        "selected_ratio": "4:5",
        "selected_country": "DE",
        "selected_ratio_preview": {
            "category_previews": [
                {
                    "category_id": "paperPrintBoxFramed",
                    "storefront_policy": {
                        "fixed_attributes": {"glaze": "Acrylic / Perspex"},
                        "recommended_defaults": {"mount": "No mount / Mat"},
                        "allowed_attributes": {"color": ["black", "white"]},
                    },
                }
            ]
        },
        "selected_country_preview": {
            "country_code": "DE",
            "country_name": "Germany",
            "category_rows": [
                {
                    "category_id": "paperPrintBoxFramed",
                    "label": "Paper Print Box Framed",
                    "short_label": "Paper Box",
                    "material_label": "Hahnemuhle German Etching",
                    "frame_label": "Box frame",
                    "fulfillment_policy": {
                        "storefront_action": storefront_action,
                        "fulfillment_level": "cross_border",
                        "geography_scope": "europe",
                        "tax_risk": "elevated",
                        "source_countries": ["GB"],
                        "fastest_delivery_days": "2-4 days",
                        "note": "Cross-border notice.",
                    },
                    "size_cells": [
                        {
                            "slot_size_label": "40x50",
                            "size_label": "40x50",
                            "available": True,
                            "is_exact_match": True,
                            "centroid_size_label": "40x50",
                            "member_size_labels": ["40x50"],
                            "offer": {
                                "sku": "SKU-1",
                                "source_country": "GB",
                                "currency": "GBP",
                                "product_price": 40.0,
                                "shipping_price": 10.0,
                                "total_cost": 50.0,
                                "delivery_days": "2-4 days",
                                "default_shipping_tier": "express",
                                "shipping_method": "Express",
                                "service_name": "Express",
                                "service_level": "EXPRESS",
                                "shipping_profiles": [
                                    {
                                        "tier": "express",
                                        "shipping_method": "Express",
                                        "service_name": "Express",
                                        "service_level": "EXPRESS",
                                        "source_country": "GB",
                                        "currency": "GBP",
                                        "product_price": 40.0,
                                        "shipping_price": 10.0,
                                        "total_cost": 50.0,
                                        "delivery_days": "2-4 days",
                                        "min_shipping_days": 2,
                                        "max_shipping_days": 4,
                                    },
                                    {
                                        "tier": "standard",
                                        "shipping_method": "Standard",
                                        "service_name": "Standard",
                                        "service_level": None,
                                        "source_country": "GB",
                                        "currency": "GBP",
                                        "product_price": 40.0,
                                        "shipping_price": 8.0,
                                        "total_cost": 48.0,
                                        "delivery_days": "4-8 days",
                                        "min_shipping_days": 4,
                                        "max_shipping_days": 8,
                                    },
                                ],
                            },
                        }
                    ],
                }
            ],
        },
    }


def test_storefront_preview_hides_notice_level_in_primary_mode() -> None:
    service = ProdigiStorefrontBakeService(SimpleNamespace(session=None))

    preview = service.build_storefront_country_preview(
        preview_payload=make_preview_payload("show_with_notice"),
        include_notice_level=False,
    )

    assert preview["storefront_mode"] == "primary_only"
    assert len(preview["visible_cards"]) == 0
    assert len(preview["hidden_cards"]) == 1


def test_storefront_preview_keeps_notice_level_when_enabled() -> None:
    service = ProdigiStorefrontBakeService(SimpleNamespace(session=None))

    preview = service.build_storefront_country_preview(
        preview_payload=make_preview_payload("show_with_notice"),
        include_notice_level=True,
    )

    assert preview["storefront_mode"] == "include_notice_level"
    assert len(preview["visible_cards"]) == 1
    assert preview["visible_cards"][0]["price_range"]["min_total"] == 50.0
    assert preview["visible_cards"][0]["default_shipping_tier"] == "express"
    assert preview["visible_cards"][0]["available_shipping_tiers"] == ["express", "standard"]
    assert preview["visible_cards"][0]["shipping_support"]["status"] == "covered"
    assert preview["visible_cards"][0]["size_options"][0]["shipping_support"]["chosen_tier"] == "express"
