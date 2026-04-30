from contextlib import contextmanager
from unittest.mock import AsyncMock, patch

import pytest


@contextmanager
def _mock_print_rehydration(product_price: float = 1000.0):
    def apply_rehydrated_print(item_add, _selection):
        item_add.customer_product_price = product_price
        item_add.customer_shipping_price = 0.0
        item_add.customer_line_total = product_price
        item_add.customer_currency = "USD"
        item_add.prodigi_storefront_bake_id = 1
        item_add.prodigi_storefront_policy_version = "test"

    with (
        patch(
            "src.services.orders.ProdigiOrderRehydrationService.rehydrate_item",
            new_callable=AsyncMock,
        ) as rehydrate_item,
        patch(
            "src.services.orders.ProdigiOrderRehydrationService.apply_to_item_add",
            side_effect=apply_rehydrated_print,
        ),
    ):
        rehydrate_item.return_value = object()
        yield


def get_base_payload(artwork_id: int, edition_type: str):
    return {
        "first_name": "John",
        "last_name": "Doe",
        "email": "johndoe@example.com",
        "phone": "5551234",
        "shipping_country": "United States",
        "shipping_country_code": "US",
        "shipping_city": "New York",
        "shipping_address_line1": "123 Main St",
        "shipping_postal_code": "10001",
        "items": [
            {
                "artwork_id": artwork_id,
                "edition_type": edition_type,
                "finish": "none",
                "price": 1000,
                "prodigi_destination_country_code": "US",
            }
        ],
    }


async def test_add_order(authenticated_ac):
    response = await authenticated_ac.post(
        "/orders",
        json=get_base_payload(1, "original"),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "OK"
    assert data["data"]["items"][0]["artwork_id"] == 1


async def test_order_exceeds_artwork_quantity(authenticated_ac):
    """Artwork 1 original gets sold, so second order should fail."""
    # First order — should succeed
    response1 = await authenticated_ac.post(
        "/orders",
        json=get_base_payload(3, "original"),
    )
    assert response1.status_code == 200

    # Second order for SAME original — should fail
    response2 = await authenticated_ac.post(
        "/orders",
        json=get_base_payload(3, "original"),
    )
    assert response2.status_code == 409
    assert "already sold" in response2.json()["detail"].lower()


@pytest.mark.parametrize(
    "order_count, artwork_ids",
    [
        (1, [1]),
        (2, [1, 3]),
        (3, [1, 3, 7]),
    ],
)
async def test_create_and_get_my_orders(
    authenticated_ac, delete_all_orders, order_count, artwork_ids
):
    """Create N orders, then check GET /orders/me returns exactly N."""
    # Create orders
    for artwork_id in artwork_ids:
        with _mock_print_rehydration():
            response = await authenticated_ac.post(
                "/orders",
                json=get_base_payload(artwork_id, "paper_print"),
            )
        assert response.status_code == 200

    # Check my orders
    response = await authenticated_ac.get("/orders/me")
    assert response.status_code == 200

    my_orders = response.json()
    assert len(my_orders) == order_count

    ordered_artwork_ids = [o["items"][0]["artwork_id"] for o in my_orders]
    for artwork_id in artwork_ids:
        assert artwork_id in ordered_artwork_ids
