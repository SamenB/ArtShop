from types import SimpleNamespace

import pytest

from src.integrations.prodigi.services.prodigi_artwork_storefront import (
    STOREFRONT_POLICY_VERSION,
    ProdigiArtworkStorefrontService,
)


class FakeArtworkService:
    def __init__(self, artwork):
        self.artwork = artwork

    async def get_artwork_by_slug(self, slug: str):
        assert slug == "golden-hour"
        return self.artwork

    async def get_artwork_by_id(self, artwork_id: int):
        assert artwork_id == self.artwork.id
        return self.artwork


class FakePrintProfileService:
    async def get_profile_bundle(self, artwork_id: int):
        assert artwork_id == 7
        return {
            "print_aspect_ratio": {"id": 1, "label": "4:5", "description": "Core Portrait"},
            "active_bake": {
                "id": 11,
                "bake_key": "active-bake",
                "paper_material": "hahnemuhle_german_etching",
                "include_notice_level": True,
                "ratio_supported": True,
            },
            "print_quality_url": "/static/print/print_7.tif",
            "print_source_metadata": {"width_px": 6000, "height_px": 7500},
            "source_quality_summary": {"status": "ready"},
            "effective_profiles": {
                "canvasStretched": {
                    "editor_mode": "provider_mirror_wrap",
                    "edge_extension_mode": "prodigi_mirror",
                    "target_dpi": 300,
                    "minimum_dpi": 150,
                    "wrap_margin_pct": 0.0,
                    "recommended_defaults": {"wrap": "White"},
                }
            },
        }


class FakeSnapshotService:
    def apply_storefront_config(self, config):
        self.config = config

    async def get_country_storefront(self, *, selected_ratio: str, country_code: str):
        assert selected_ratio == "4:5"
        assert country_code == "DE"
        return {
            "has_active_bake": True,
            "message": "Country storefront slice loaded from the active baked snapshot.",
            "country_code": "DE",
            "country_name": "Germany",
            "available_country_codes": ["DE", "FR"],
            "entry_promo": {
                "overall": {"eligible": True, "note": "Eligible."},
                "paper_print": {"eligible": False, "note": "Disabled."},
                "canvas": {"eligible": True, "note": "Eligible."},
            },
            "category_cells": [
                {
                    "category_id": "canvasStretched",
                    "storefront_action": "show",
                    "effective_fulfillment_level": "regional",
                    "effective_geography_scope": "europe",
                    "effective_tax_risk": "low",
                    "source_mix": "regional_only",
                    "source_countries": ["DE", "NL"],
                    "available_shipping_tiers": ["express", "standard"],
                    "default_shipping_tier": "standard",
                    "shipping_support": {"status": "covered"},
                    "business_summary": {"default_shipping_mode": "included"},
                    "fixed_attributes": {},
                    "recommended_defaults": {"wrap": "MirrorWrap"},
                    "allowed_attributes": {"color": ["black", "white"]},
                    "size_entries": [
                        {
                            "slot_size_label": "40x50",
                            "size_label": "40x50",
                            "available": True,
                            "sku": "SKU-40x50",
                            "source_country": "DE",
                            "currency": "EUR",
                            "delivery_days": "2-4 days",
                            "shipping_method": "Standard",
                            "service_name": "Standard",
                            "service_level": "STANDARD",
                            "default_shipping_tier": "standard",
                            "shipping_profiles": [{"tier": "standard", "shipping_price": 12.0}],
                            "shipping_support": {
                                "status": "covered",
                                "chosen_tier": "standard",
                                "chosen_shipping_price": 12.0,
                            },
                            "business_policy": {
                                "shipping_mode": "pass_through",
                                "retail_product_price": 149.0,
                                "customer_shipping_price": 12.0,
                            },
                            "product_price": 49.0,
                            "shipping_price": 12.0,
                            "total_cost": 61.0,
                        },
                        {
                            "slot_size_label": "60x75",
                            "size_label": "60x75",
                            "available": True,
                            "sku": "SKU-60x75",
                            "source_country": "DE",
                            "currency": "EUR",
                            "delivery_days": "3-6 days",
                            "shipping_method": "Express",
                            "service_name": "Express",
                            "service_level": "EXPRESS",
                            "default_shipping_tier": "express",
                            "shipping_profiles": [{"tier": "express", "shipping_price": 60.0}],
                            "shipping_support": {
                                "status": "blocked",
                                "chosen_tier": None,
                                "chosen_shipping_price": None,
                            },
                            "business_policy": {
                                "shipping_mode": "hide",
                                "retail_product_price": 199.0,
                                "customer_shipping_price": None,
                            },
                            "product_price": 39.0,
                            "shipping_price": 60.0,
                            "total_cost": 99.0,
                        },
                    ],
                }
            ],
            "categories": [
                {
                    "category_id": "paperPrintRolled",
                    "label": "Paper Print Unframed",
                    "material_label": "Hahnemuhle German Etching",
                    "frame_label": "No frame",
                },
                {
                    "category_id": "canvasStretched",
                    "label": "Canvas Stretched",
                    "material_label": "Standard Canvas",
                    "frame_label": "38mm stretched canvas",
                },
            ],
        }


class FakeStorefrontRepository:
    async def get_active_bake(self):
        return None


class FakeMaterializedRepository:
    async def get_active_bake(self):
        return SimpleNamespace(id=11)

    async def get_materialized_payload_for_ref(
        self,
        *,
        bake_id: int,
        artwork_id_or_slug: str,
        country_code: str,
    ):
        assert bake_id == 11
        assert artwork_id_or_slug == "golden-hour"
        assert country_code == "DE"
        return SimpleNamespace(
            payload={
                "artwork_id": 7,
                "slug": "golden-hour",
                "country_code": "DE",
                "country_name": "Germany",
                "storefront_policy_version": STOREFRONT_POLICY_VERSION,
                "country_supported": True,
                "mediums": {
                    "paper": {"cards": []},
                    "canvas": {"cards": [{"category_id": "canvasStretched"}]},
                },
            }
        )


class FakeStaleMaterializedRepository(FakeMaterializedRepository):
    async def get_materialized_payload_for_ref(
        self,
        *,
        bake_id: int,
        artwork_id_or_slug: str,
        country_code: str,
    ):
        row = await super().get_materialized_payload_for_ref(
            bake_id=bake_id,
            artwork_id_or_slug=artwork_id_or_slug,
            country_code=country_code,
        )
        row.payload.pop("storefront_policy_version", None)
        return row


@pytest.mark.asyncio
async def test_artwork_storefront_filters_hidden_sizes_and_disabled_mediums() -> None:
    artwork = SimpleNamespace(
        id=7,
        slug="golden-hour",
        title="Golden Hour",
        has_paper_print=False,
        has_paper_print_limited=False,
        paper_print_limited_quantity=None,
        has_canvas_print=True,
        has_canvas_print_limited=True,
        canvas_print_limited_quantity=15,
    )
    service = ProdigiArtworkStorefrontService(SimpleNamespace(session=None))
    service.snapshot_service = FakeSnapshotService()

    profile_bundle = await FakePrintProfileService().get_profile_bundle(artwork.id)
    snapshot = await FakeSnapshotService().get_country_storefront(
        selected_ratio="4:5",
        country_code="DE",
    )
    payload = service.build_payload_from_snapshot(
        artwork=artwork,
        requested_country="DE",
        profile_bundle=profile_bundle,
        snapshot=snapshot,
    )

    assert payload["country_supported"] is True
    assert payload["country_code"] == "DE"
    assert payload["print_source_metadata"]["width_px"] == 6000
    assert payload["mediums"]["paper"]["cards"] == []
    assert len(payload["mediums"]["canvas"]["cards"]) == 1

    canvas_card = payload["mediums"]["canvas"]["cards"][0]
    assert canvas_card["category_id"] == "canvasStretched"
    assert canvas_card["default_prodigi_attributes"] == {
        "wrap": "White",
        "color": "black",
    }
    assert canvas_card["edition_context"]["limited_quantity"] == 15
    assert canvas_card["print_profile"]["edge_extension_mode"] == "prodigi_mirror"
    assert canvas_card["print_profile"]["wrap_margin_pct"] == 0.0
    assert len(canvas_card["size_options"]) == 2
    assert canvas_card["size_options"][0]["sku"] == "SKU-40x50"
    assert canvas_card["size_options"][0]["supplier_product_price"] == 49.0
    assert canvas_card["size_options"][0]["supplier_shipping_price"] == 12.0
    assert canvas_card["size_options"][0]["customer_total_price"] == 168.8


@pytest.mark.asyncio
async def test_artwork_storefront_prefers_materialized_payload() -> None:
    artwork = SimpleNamespace(id=7, slug="golden-hour", title="Golden Hour")
    service = ProdigiArtworkStorefrontService(SimpleNamespace(session=None))
    service.artwork_service = FakeArtworkService(artwork)
    service.read_model.repository = FakeMaterializedRepository()

    payload = await service.get_artwork_storefront("golden-hour", "de")

    assert payload["country_code"] == "DE"
    assert payload["country_supported"] is True
    assert payload["mediums"]["canvas"]["cards"][0]["category_id"] == "canvasStretched"


@pytest.mark.asyncio
async def test_artwork_storefront_does_not_rebuild_stale_materialized_payload() -> None:
    artwork = SimpleNamespace(
        id=7,
        slug="golden-hour",
        title="Golden Hour",
        has_paper_print=False,
        has_paper_print_limited=False,
        paper_print_limited_quantity=None,
        has_canvas_print=True,
        has_canvas_print_limited=True,
        canvas_print_limited_quantity=15,
    )
    service = ProdigiArtworkStorefrontService(SimpleNamespace(session=None))
    service.artwork_service = FakeArtworkService(artwork)
    service.print_profile_service = FakePrintProfileService()
    service.read_model.repository = FakeStaleMaterializedRepository()
    service.snapshot_service = FakeSnapshotService()

    payload = await service.get_artwork_storefront("golden-hour", "de")

    assert payload["storefront_policy_version"] == STOREFRONT_POLICY_VERSION
    assert payload["mediums"]["canvas"]["cards"] == []
    assert "No current materialized storefront payload exists" in payload["message"]
