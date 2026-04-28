from types import SimpleNamespace

import pytest

from src.integrations.prodigi.services.prodigi_order_rehydration import (
    ProdigiOrderRehydrationError,
    ProdigiOrderRehydrationService,
    RehydratedProdigiSelection,
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
            offer_size_id=42,
            sku="BAKED-SKU",
            category_id="paperPrintBoxFramed",
            slot_size_label="40x50",
            attributes={"color": "black"},
            shipping_method="Standard",
            wholesale_eur=12.5,
            shipping_eur=3.25,
            retail_eur=30.0,
            customer_total_price=33.25,
            size_label="40 x 50 cm",
        ),
    )

    assert item_add.prodigi_storefront_offer_size_id == 42
    assert item_add.prodigi_sku == "BAKED-SKU"
    assert item_add.prodigi_category_id == "paperPrintBoxFramed"
    assert item_add.prodigi_slot_size_label == "40x50"
    assert item_add.prodigi_attributes == {"color": "black"}
    assert item_add.prodigi_shipping_method == "Standard"
    assert item_add.prodigi_retail_eur == 30.0
    assert item_add.price == 33
    assert item_add.size == "40 x 50 cm"


def test_resolve_attributes_rejects_client_value_outside_baked_allowed_set():
    group = SimpleNamespace(
        allowed_attributes={"color": ["black", "white"]},
        fixed_attributes={},
        recommended_defaults={},
    )
    size = SimpleNamespace(print_area_dimensions={})

    with pytest.raises(ProdigiOrderRehydrationError):
        _service()._resolve_attributes(
            group=group,
            size=size,
            storefront_size={},
            client_attrs={"color": "gold"},
        )


def test_resolve_attributes_ignores_untrusted_unknown_client_keys():
    group = SimpleNamespace(
        allowed_attributes={"color": ["black", "white"]},
        fixed_attributes={"mount": "none"},
        recommended_defaults={"color": "black"},
    )
    size = SimpleNamespace(print_area_dimensions={})

    resolved = _service()._resolve_attributes(
        group=group,
        size=size,
        storefront_size={"provider_attributes": {"paper": "HGE"}},
        client_attrs={"color": "white", "sku": "EVIL"},
    )

    assert resolved == {"paper": "HGE", "mount": "none", "color": "white"}
