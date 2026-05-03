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


class TestAdminOrders:
    """
    Integration tests for administrative order management endpoints.
    Verifies PATCH (partial updates) and DELETE operations.
    """

    async def test_patch_order_details(self, authenticated_ac, db):
        """PATCH /orders/{id} allows updating customer and shipping info."""
        # 1. Create an order to patch
        order_payload = {
            "first_name": "Original",
            "last_name": "Name",
            "email": "patch@test.com",
            "phone": "0000000000",
            "shipping_country": "TestCountry",
            "shipping_country_code": "TC",
            "shipping_city": "TestCity",
            "shipping_address_line1": "TestSt 1",
            "shipping_postal_code": "00000",
            "items": [
                {
                    "artwork_id": 6,
                    "edition_type": "paper_print",
                    "finish": "Rolled",
                    "price": 1000,
                    "prodigi_destination_country_code": "TC",
                }
            ],
        }
        with _mock_print_rehydration():
            create_resp = await authenticated_ac.post("/orders", json=order_payload)
        assert create_resp.status_code == 200
        order_id = create_resp.json()["data"]["id"]

        # 2. Apply patch
        patch_payload = {
            "first_name": "Updated",
            "shipping_city": "NewCity",
            "payment_status": "processing",
        }
        patch_resp = await authenticated_ac.patch(f"/orders/{order_id}", json=patch_payload)
        assert patch_resp.status_code == 200

        # 3. Verify changes
        order = await db.orders.get_one(id=order_id)
        assert order.first_name == "Updated"
        assert order.shipping_city == "NewCity"
        assert order.payment_status == "processing"
        # Unchanged fields
        assert order.last_name == "Name"

    async def test_delete_order_and_artwork_revert(self, authenticated_ac, db, delete_all_orders):
        """DELETE /orders/{id} removes order and reverts 'sold' status for originals."""
        # 1. Create an order with an original artwork
        # Artwork #7 is "available"
        order_payload = {
            "first_name": "ShortLived",
            "last_name": "Order",
            "email": "delete@test.com",
            "phone": "0000000000",
            "shipping_country": "TestCountry",
            "shipping_country_code": "TC",
            "shipping_city": "TestCity",
            "shipping_address_line1": "TestSt 1",
            "shipping_postal_code": "00000",
            "items": [
                {"artwork_id": 7, "edition_type": "original", "finish": "Standard", "price": 5000}
            ],
        }
        create_resp = await authenticated_ac.post("/orders", json=order_payload)
        assert create_resp.status_code == 200
        order_id = create_resp.json()["data"]["id"]

        # Verify artwork is marked as "sold"
        artwork = await db.artworks.get_one(id=7)
        assert artwork.original_status == "sold"

        # 2. Delete the order
        delete_resp = await authenticated_ac.delete(f"/orders/{order_id}")
        assert delete_resp.status_code == 200

        # 3. Verify order is gone
        with pytest.raises(Exception):  # ObjectNotFoundException
            await db.orders.get_one(id=order_id)

        # 4. Verify artwork is "available" again
        artwork_reverted = await db.artworks.get_one(id=7)
        assert artwork_reverted.original_status == "available"

    async def test_patch_order_unauthorized(self, ac):
        """PATCH /orders/{id} without admin privileges returns 401/403."""
        # Note: 'ac' fixture is unauthenticated
        resp = await ac.patch("/orders/1", json={"first_name": "Hack"})
        assert resp.status_code in [401, 403]

    async def test_delete_order_unauthorized(self, ac):
        """DELETE /orders/{id} without admin privileges returns 401/403."""
        resp = await ac.delete("/orders/1")
        assert resp.status_code in [401, 403]
