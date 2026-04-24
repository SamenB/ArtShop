from __future__ import annotations

import pytest

from src.connectors.prodigi import ProductDetails, ProductVariant
from src.services.prodigi_print_area_resolver import ProdigiPrintAreaResolver


@pytest.mark.asyncio
async def test_resolver_uses_supplier_inches_before_rounded_cm() -> None:
    resolver = ProdigiPrintAreaResolver()

    result = await resolver.resolve(
        sku=None,
        destination_country="DE",
        category_id="paperPrintRolled",
        attributes={},
        supplier_size_inches='48x60"',
        supplier_size_cm="122x152cm",
        slot_size_label="122x152",
    )

    assert result["print_area_width_px"] == 14400
    assert result["print_area_height_px"] == 18000
    assert result["print_area_source"] == "supplier_size_inches_fallback"


@pytest.mark.asyncio
async def test_resolver_uses_clean_canvas_size_for_mirrorwrap_physical_fallback() -> None:
    resolver = ProdigiPrintAreaResolver()

    result = await resolver.resolve(
        sku=None,
        destination_country="DE",
        category_id="canvasStretched",
        attributes={"wrap": "MirrorWrap"},
        supplier_size_inches='48x60"',
        supplier_size_cm="122x152cm",
        slot_size_label="122x152",
        wrap_margin_pct=0.0,
    )

    assert result["print_area_width_px"] == 14400
    assert result["print_area_height_px"] == 18000
    assert result["print_area_source"] == "supplier_size_inches_fallback"


@pytest.mark.asyncio
async def test_resolver_selects_mirrorwrap_variant_for_canvas_clean_assets() -> None:
    resolver = ProdigiPrintAreaResolver()
    resolver._client = object()  # Product is pre-cached, so no HTTP call is made.
    resolver._product_cache["CAN-38MM-FRA-SC-48X60"] = ProductDetails(
        sku="CAN-38MM-FRA-SC-48X60",
        description="Float framed Standard Canvas, 48x60",
        width_in=48,
        height_in=60,
        attributes={"wrap": ["MirrorWrap", "ImageWrap"]},
        variants=[
            ProductVariant(
                attributes={"wrap": "MirrorWrap", "color": "black"},
                ships_to=["DE"],
                print_area_sizes={
                    "default": {
                        "horizontalResolution": 14454,
                        "verticalResolution": 18054,
                    }
                },
            ),
            ProductVariant(
                attributes={"wrap": "ImageWrap", "color": "black"},
                ships_to=["DE"],
                print_area_sizes={
                    "default": {
                        "horizontalResolution": 15345,
                        "verticalResolution": 18945,
                    }
                },
            ),
        ],
    )

    result = await resolver.resolve(
        sku="CAN-38MM-FRA-SC-48x60",
        destination_country="DE",
        category_id="canvasFloatingFrame",
        attributes={"wrap": "MirrorWrap", "color": "black"},
        supplier_size_inches='48x60"',
        supplier_size_cm="122x152cm",
        slot_size_label="122x152",
    )

    assert result["print_area_width_px"] == 14454
    assert result["print_area_height_px"] == 18054
    assert result["visible_art_width_px"] == 14400
    assert result["visible_art_height_px"] == 18000
    assert result["print_area_source"] == "prodigi_product_details"
    assert result["print_area_dimensions"]["variant_attributes"]["wrap"] == "MirrorWrap"


@pytest.mark.asyncio
async def test_resolver_does_not_fall_back_to_wrong_variant_when_attributes_do_not_match() -> None:
    resolver = ProdigiPrintAreaResolver()
    resolver._client = object()  # Product is pre-cached, so no HTTP call is made.
    resolver._product_cache["CAN-38MM-FRA-SC-48X60"] = ProductDetails(
        sku="CAN-38MM-FRA-SC-48X60",
        description="Float framed Standard Canvas, 48x60",
        width_in=48,
        height_in=60,
        attributes={"wrap": ["ImageWrap"]},
        variants=[
            ProductVariant(
                attributes={"wrap": "ImageWrap", "color": "black"},
                ships_to=["DE"],
                print_area_sizes={
                    "default": {
                        "horizontalResolution": 15345,
                        "verticalResolution": 18945,
                    }
                },
            )
        ],
    )

    result = await resolver.resolve(
        sku="CAN-38MM-FRA-SC-48x60",
        destination_country="DE",
        category_id="canvasFloatingFrame",
        attributes={"wrap": "MirrorWrap", "color": "black"},
        supplier_size_inches='48x60"',
        supplier_size_cm="122x152cm",
        slot_size_label="122x152",
    )

    assert result["print_area_source"] == "supplier_size_inches_fallback"


@pytest.mark.asyncio
async def test_resolver_can_fallback_from_preferred_wrap_to_provider_variant() -> None:
    resolver = ProdigiPrintAreaResolver()
    resolver._client = object()  # Product is pre-cached, so no HTTP call is made.
    resolver._product_cache["GLOBAL-FRA-SLIMCAN-24X24"] = ProductDetails(
        sku="GLOBAL-FRA-SLIMCAN-24X24",
        description="Classic framed canvas, 24x24",
        width_in=24,
        height_in=24,
        attributes={"wrap": ["White"], "color": ["black"]},
        variants=[
            ProductVariant(
                attributes={"wrap": "White", "color": "black"},
                ships_to=["DE"],
                print_area_sizes={
                    "default": {
                        "horizontalResolution": 7245,
                        "verticalResolution": 7245,
                    }
                },
            )
        ],
    )

    result = await resolver.resolve(
        sku="GLOBAL-FRA-SLIMCAN-24x24",
        destination_country="DE",
        category_id="canvasClassicFrame",
        attributes={"wrap": "MirrorWrap", "color": "black"},
        optional_attribute_keys={"wrap"},
        supplier_size_inches='24x24"',
        supplier_size_cm="61x61cm",
        slot_size_label="61x61",
    )

    assert result["print_area_width_px"] == 7245
    assert result["print_area_height_px"] == 7245
    assert result["print_area_source"] == "prodigi_product_details"
    assert result["print_area_dimensions"]["variant_attributes"]["wrap"] == "White"


@pytest.mark.asyncio
async def test_resolver_uses_prodigi_product_dimensions_when_variant_print_area_sizes_are_empty() -> None:
    resolver = ProdigiPrintAreaResolver()
    resolver._client = object()  # Product is pre-cached, so no HTTP call is made.
    resolver._product_cache["GLOBAL-FRA-CAN-14X14"] = ProductDetails(
        sku="GLOBAL-FRA-CAN-14X14",
        description='Global float framed canvas 14x14"',
        width_in=14,
        height_in=14,
        attributes={"wrap": ["MirrorWrap"]},
        variants=[
            ProductVariant(
                attributes={"wrap": "MirrorWrap", "color": "black"},
                ships_to=["CA"],
                print_area_sizes={},
            )
        ],
    )

    result = await resolver.resolve(
        sku="GLOBAL-FRA-CAN-14X14",
        destination_country="CA",
        category_id="canvasFloatingFrame",
        attributes={"wrap": "MirrorWrap", "color": "black"},
        supplier_size_inches='14x14"',
        supplier_size_cm="36x36cm",
        slot_size_label="36x36",
    )

    assert result["print_area_width_px"] == 4200
    assert result["print_area_height_px"] == 4200
    assert result["visible_art_width_px"] == 4200
    assert result["visible_art_height_px"] == 4200
    assert result["print_area_source"] == "prodigi_product_dimensions"
