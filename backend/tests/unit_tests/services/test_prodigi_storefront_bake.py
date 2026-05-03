from types import SimpleNamespace

import pytest

from src.integrations.prodigi.services.prodigi_storefront_bake import (
    ProdigiPrintAreaBakeError,
    ProdigiStorefrontBakeService,
)


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
    assert (
        preview["visible_cards"][0]["size_options"][0]["shipping_support"]["chosen_tier"]
        == "express"
    )


def test_bake_rejects_visible_sizes_without_prodigi_print_area_pixels() -> None:
    service = ProdigiStorefrontBakeService(SimpleNamespace(session=None))
    preview = service.build_storefront_country_preview(
        preview_payload=make_preview_payload("show"),
        include_notice_level=True,
    )
    preview["visible_cards"][0]["size_options"][0].update(
        {
            "print_area_width_px": 4724,
            "print_area_height_px": 5905,
            "print_area_source": "supplier_size_cm_fallback",
        }
    )

    with pytest.raises(ProdigiPrintAreaBakeError):
        service._assert_provider_print_area_sizes(preview)


def test_bake_accepts_visible_sizes_with_prodigi_print_area_pixels() -> None:
    service = ProdigiStorefrontBakeService(SimpleNamespace(session=None))
    preview = service.build_storefront_country_preview(
        preview_payload=make_preview_payload("show"),
        include_notice_level=True,
    )
    preview["visible_cards"][0]["size_options"][0].update(
        {
            "print_area_width_px": 4724,
            "print_area_height_px": 5905,
            "print_area_source": "prodigi_product_details",
        }
    )

    service._assert_provider_print_area_sizes(preview)


def test_bake_accepts_prodigi_product_dimensions_as_provider_pixels() -> None:
    service = ProdigiStorefrontBakeService(SimpleNamespace(session=None))
    preview = service.build_storefront_country_preview(
        preview_payload=make_preview_payload("show"),
        include_notice_level=True,
    )
    preview["visible_cards"][0]["size_options"][0].update(
        {
            "print_area_width_px": 4200,
            "print_area_height_px": 4200,
            "print_area_source": "prodigi_product_dimensions",
        }
    )

    service._assert_provider_print_area_sizes(preview)


def test_bake_filters_visible_sizes_without_prodigi_print_area_pixels() -> None:
    service = ProdigiStorefrontBakeService(SimpleNamespace(session=None))
    preview = service.build_storefront_country_preview(
        preview_payload=make_preview_payload("show"),
        include_notice_level=True,
    )
    original_size = preview["visible_cards"][0]["size_options"][0]
    preview["visible_cards"][0]["size_options"] = [
        {
            **original_size,
            "slot_size_label": "40x50",
            "print_area_source": "supplier_size_cm_fallback",
        },
        {
            **original_size,
            "slot_size_label": "50x70",
            "print_area_source": "prodigi_product_dimensions",
        },
    ]

    service._keep_only_provider_print_area_sizes(preview)

    kept_sizes = preview["visible_cards"][0]["size_options"]
    assert [item["slot_size_label"] for item in kept_sizes] == ["50x70"]
    assert len(preview["removed_size_options_without_provider_print_area"]) == 1


def test_bake_filters_visible_sizes_with_mismatched_visible_art_ratio() -> None:
    service = ProdigiStorefrontBakeService(SimpleNamespace(session=None))
    preview = service.build_storefront_country_preview(
        preview_payload=make_preview_payload("show"),
        include_notice_level=True,
    )
    preview["visible_cards"][0]["size_options"][0].update(
        {
            "slot_size_label": "40x50",
            "print_area_width_px": 5000,
            "print_area_height_px": 6300,
            "visible_art_width_px": 5000,
            "visible_art_height_px": 6300,
            "print_area_source": "prodigi_product_details",
            "print_area_dimensions": {
                "visible_art_width_px": 5000,
                "visible_art_height_px": 6300,
            },
        }
    )

    service._keep_only_provider_print_area_sizes(preview)

    assert len(preview["visible_cards"]) == 0
    assert preview["removed_size_options_without_provider_print_area"][0]["reason"] == (
        "visible_art_ratio_mismatch"
    )


def test_bake_keeps_provider_sizes_when_visible_art_ratio_matches_even_if_print_area_drifts() -> (
    None
):
    service = ProdigiStorefrontBakeService(SimpleNamespace(session=None))
    preview = service.build_storefront_country_preview(
        preview_payload=make_preview_payload("show"),
        include_notice_level=True,
    )
    preview["visible_cards"][0]["size_options"][0].update(
        {
            "slot_size_label": "122x152",
            "print_area_width_px": 14454,
            "print_area_height_px": 18054,
            "visible_art_width_px": 14400,
            "visible_art_height_px": 18000,
            "print_area_source": "prodigi_product_details",
            "print_area_dimensions": {
                "visible_art_width_px": 14400,
                "visible_art_height_px": 18000,
                "physical_width_in": 48,
                "physical_height_in": 60,
            },
        }
    )

    service._keep_only_provider_print_area_sizes(preview)

    assert len(preview["visible_cards"]) == 1
    kept_sizes = preview["visible_cards"][0]["size_options"]
    assert [item["slot_size_label"] for item in kept_sizes] == ["122x152"]
    assert preview["removed_size_options_without_provider_print_area"] == []


def test_bake_requires_exact_canvas_wrap_provider_variant() -> None:
    service = ProdigiStorefrontBakeService(SimpleNamespace(session=None))

    assert service._optional_provider_attribute_keys("canvasStretched") == set()
    assert service._optional_provider_attribute_keys("canvasClassicFrame") == set()
    assert service._optional_provider_attribute_keys("canvasFloatingFrame") == set()


@pytest.mark.asyncio
async def test_bake_filters_canvas_sizes_without_full_wrap_support() -> None:
    service = ProdigiStorefrontBakeService(SimpleNamespace(session=None))
    preview = {
        "country_code": "DE",
        "ratio": "4:5",
        "visible_cards": [
            {
                "category_id": "canvasFloatingFrame",
                "label": "Floating framed canvas",
                "storefront_action": "show",
                "fulfillment_level": "direct",
                "geography_scope": "global",
                "tax_risk": "normal",
                "size_options": [
                    {
                        "slot_size_label": "40x50",
                        "size_label": "40x50",
                        "sku": "SKU-KEEP",
                        "currency": "EUR",
                        "total_cost": 120.0,
                    },
                    {
                        "slot_size_label": "50x70",
                        "size_label": "50x70",
                        "sku": "SKU-DROP",
                        "currency": "EUR",
                        "total_cost": 150.0,
                    },
                ],
            }
        ],
        "hidden_cards": [],
        "removed_size_options": [],
    }

    class FakeResolver:
        async def get_available_attribute_values(self, *, sku, destination_country, attribute_key):
            if sku == "SKU-KEEP":
                return {"White", "Black", "ImageWrap", "MirrorWrap"}
            return {"White", "Black", "MirrorWrap"}

    await service._keep_only_supported_canvas_wrap_sizes(preview, FakeResolver())

    kept_sizes = preview["visible_cards"][0]["size_options"]
    assert [item["slot_size_label"] for item in kept_sizes] == ["40x50"]
    assert preview["removed_size_options"][0]["reason"] == "missing_required_canvas_wraps"
