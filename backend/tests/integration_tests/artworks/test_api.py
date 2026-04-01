import pytest


def get_base_payload(artwork_id: int, edition_type: str):
    return {
        "first_name": "John",
        "last_name": "Doe",
        "email": "johndoe@example.com",
        "phone": "5551234",
        "items": [
            {
                "artwork_id": artwork_id,
                "edition_type": edition_type,
                "finish": "none",
                "price": 1000,
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
        response = await authenticated_ac.post(
            "/orders",
            json=get_base_payload(artwork_id, "print"),
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
