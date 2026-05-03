from types import SimpleNamespace

import pytest

from src.integrations.prodigi.services.prodigi_business_policy import (
    ProdigiBusinessPolicyService,
)
from src.integrations.prodigi.services.prodigi_order_rehydration import (
    ProdigiOrderRehydrationError,
    ProdigiOrderRehydrationService,
    RehydratedProdigiSelection,
)
from src.integrations.prodigi.services.prodigi_storefront_read_model import (
    ProdigiStorefrontReadModelService,
)
from src.schemas.orders import OrderItemAdd


def _service():
    return ProdigiOrderRehydrationService(SimpleNamespace(session=None))


def test_apply_to_item_add_overwrites_client_prodigi_fields_from_bake():
    item_add = OrderItemAdd(
        order_id=1,
        artwork_id=2,
        edition_type="paper_print",
        finish="Client Finish",
        size="client-size",
        price=1,
        prodigi_storefront_offer_size_id=999,
        prodigi_sku="CLIENT-SKU",
        prodigi_category_id="paperPrintRolled",
        prodigi_slot_size_label="client-slot",
        prodigi_attributes={"color": "client"},
        prodigi_shipping_method="Client",
        prodigi_wholesale_eur=1.0,
        prodigi_shipping_eur=1.0,
        prodigi_retail_eur=1.0,
    )

    _service().apply_to_item_add(
        item_add,
        RehydratedProdigiSelection(
            bake_id=10,
            policy_version="print_shipping_passthrough_v1",
            offer_size_id=42,
            sku="BAKED-SKU",
            category_id="paperPrintBoxFramed",
            slot_size_label="40x50",
            attributes={"color": "black"},
            shipping_tier="overnight",
            shipping_method="Overnight",
            delivery_days="1 days",
            wholesale_eur=12.5,
            shipping_eur=21.95,
            customer_shipping_eur=21.95,
            retail_eur=17.5,
            customer_total_price=39.45,
            size_label="40 x 50 cm",
            supplier_currency="EUR",
        ),
    )

    assert item_add.prodigi_storefront_bake_id == 10
    assert item_add.prodigi_storefront_policy_version == "print_shipping_passthrough_v1"
    assert item_add.prodigi_storefront_offer_size_id == 42
    assert item_add.prodigi_sku == "BAKED-SKU"
    assert item_add.prodigi_category_id == "paperPrintBoxFramed"
    assert item_add.prodigi_slot_size_label == "40x50"
    assert item_add.prodigi_attributes == {"color": "black"}
    assert item_add.prodigi_shipping_tier == "overnight"
    assert item_add.prodigi_shipping_method == "Overnight"
    assert item_add.prodigi_delivery_days == "1 days"
    assert item_add.prodigi_retail_eur == 17.5
    assert item_add.customer_product_price == 17.5
    assert item_add.customer_shipping_price == 21.95
    assert item_add.customer_line_total == 39.45
    assert item_add.price == 40
    assert item_add.size == "40 x 50 cm"


def test_materialized_payload_selection_uses_customer_shipping_not_supplier_fallback():
    read_model = ProdigiStorefrontReadModelService(SimpleNamespace(session=None))
    payload = {
        "storefront_policy_version": ProdigiBusinessPolicyService.POLICY_VERSION,
        "mediums": {
            "canvas": {
                "cards": [
                    {
                        "category_id": "canvasRolled",
                        "default_prodigi_attributes": {"wrap": "none"},
                        "allowed_attribute_options": {"wrap": ["none"]},
                        "size_options": [
                            {
                                "id": 164540,
                                "sku": "GLOBAL-CANVAS-20X25",
                                "slot_size_label": "20x25",
                                "size_label": "20 x 25 cm",
                                "retail_product_price": 17.5,
                                "customer_shipping_price": 21.95,
                                "customer_total_price": 39.45,
                                "supplier_product_price": 5.0,
                                "supplier_shipping_price": 8.95,
                                "supplier_total_cost": 26.95,
                                "currency": "EUR",
                                "business_policy": {"shipping_mode": "pass_through"},
                                "shipping_support": {
                                    "status": "covered",
                                    "chosen_tier": "overnight",
                                    "chosen_shipping_method": "Overnight",
                                    "chosen_delivery_days": "1 days",
                                    "chosen_product_price": 5.0,
                                    "chosen_shipping_price": 21.95,
                                    "chosen_currency": "EUR",
                                },
                            }
                        ],
                    }
                ]
            }
        },
    }

    resolved = read_model.resolve_print_selection(
        payload=payload,
        item_data=SimpleNamespace(
            prodigi_storefront_offer_size_id=164540,
            prodigi_category_id="canvasRolled",
            prodigi_slot_size_label="20x25",
            prodigi_sku="GLOBAL-CANVAS-20X25",
            prodigi_attributes={},
        ),
    )
    selection = read_model._build_customer_selection(
        bake_id=10,
        policy_version=ProdigiBusinessPolicyService.POLICY_VERSION,
        country="DE",
        selection=resolved,
    )

    assert selection.customer_product_price == 17.5
    assert selection.customer_shipping_price == 21.95
    assert selection.customer_total_price == 39.45
    assert selection.shipping_tier == "overnight"
    assert selection.shipping_method == "Overnight"
    assert selection.supplier_shipping_cost == 21.95


def test_customer_total_mismatch_blocks_selection():
    read_model = ProdigiStorefrontReadModelService(SimpleNamespace(session=None))
    selection = SimpleNamespace(
        card={"category_id": "canvasRolled"},
        size={
            "id": 1,
            "slot_size_label": "20x25",
            "sku": "SKU",
            "retail_product_price": 17.5,
            "customer_shipping_price": 21.95,
            "customer_total_price": 27,
            "shipping_support": {"status": "covered"},
        },
        attributes={},
    )

    with pytest.raises(ValueError, match="product plus shipping"):
        read_model._build_customer_selection(
            bake_id=10,
            policy_version=ProdigiBusinessPolicyService.POLICY_VERSION,
            country="DE",
            selection=selection,
        )


def test_missing_offer_size_id_blocks_checkout_rehydration():
    with pytest.raises(ProdigiOrderRehydrationError, match="offer size id"):
        import asyncio

        asyncio.run(
            _service().rehydrate_item(
                artwork=SimpleNamespace(id=2, slug="art-2"),
                item_data=SimpleNamespace(prodigi_storefront_offer_size_id=None),
                destination_country="DE",
            )
        )
