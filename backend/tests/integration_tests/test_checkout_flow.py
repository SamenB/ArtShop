"""
Integration tests for the complete checkout→payment→tracking flow.

Covers:
- Order creation via API (with shipping, originals, prints)
- Inventory enforcement (original sold → 409, prints disabled → 409)
- DB persistence verification
- Order lookup by email (public tracking)
- Payment status endpoint
- Monobank invoice creation (mocked)
- Webhook processing (status transitions, idempotency, signature rejection)
"""

import json
from unittest.mock import AsyncMock, patch

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _order_payload(**overrides) -> dict:
    """Returns a minimal valid order payload with all required shipping fields."""
    base = {
        "first_name": "Anna",
        "last_name": "Bondarenko",
        "email": "anna@example.com",
        "phone": "+380501234567",
        "shipping_country": "Ukraine",
        "shipping_country_code": "UA",
        "shipping_city": "Kyiv",
        "shipping_address_line1": "Pogranichna 145",
        "shipping_postal_code": "01001",
        "items": [
            {
                "artwork_id": 6,
                "edition_type": "paper_print",
                "finish": "Rolled",
                "size": "50x70",
                "price": 1500,
            }
        ],
    }
    base.update(overrides)
    return base


# ---------------------------------------------------------------------------
# Order Creation
# ---------------------------------------------------------------------------


class TestOrderCreation:
    async def test_create_order_basic(self, ac):
        """POST /orders with valid data returns 200 and order data."""
        payload = _order_payload()
        resp = await ac.post("/orders", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "OK"
        order = data["data"]
        assert order["first_name"] == "Anna"
        assert order["email"] == "anna@example.com"
        assert order["total_price"] == 1500
        assert len(order["items"]) == 1
        assert order["items"][0]["edition_type"] == "paper_print"

    async def test_create_order_with_full_shipping(self, ac):
        """All shipping fields are persisted correctly."""
        payload = _order_payload(
            shipping_state="Kyivska",
            shipping_address_line2="Apt 42",
            shipping_phone="+380509999999",
            shipping_notes="Ring doorbell twice",
        )
        resp = await ac.post("/orders", json=payload)
        assert resp.status_code == 200
        order = resp.json()["data"]
        assert order["shipping_country"] == "Ukraine"
        assert order["shipping_country_code"] == "UA"
        assert order["shipping_city"] == "Kyiv"
        assert order["shipping_address_line1"] == "Pogranichna 145"
        assert order["shipping_postal_code"] == "01001"
        assert order["shipping_state"] == "Kyivska"
        assert order["shipping_address_line2"] == "Apt 42"
        assert order["shipping_notes"] == "Ring doorbell twice"

    async def test_create_order_missing_required_fields(self, ac):
        """Order without required shipping returns 422."""
        resp = await ac.post(
            "/orders",
            json={
                "first_name": "X",
                "last_name": "Y",
                "email": "x@y.com",
                "phone": "1234567",
                "items": [
                    {"artwork_id": 6, "edition_type": "print", "finish": "Rolled", "price": 100}
                ],
                # Missing all shipping fields
            },
        )
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Inventory Enforcement
# ---------------------------------------------------------------------------


class TestInventoryEnforcement:
    async def test_buy_original_marks_sold(self, ac, delete_all_orders):
        """Purchasing an original artwork → status 'sold', second buy → 409."""
        # Artwork #7 (The Scream Copy) is "available"
        payload = _order_payload(
            items=[
                {
                    "artwork_id": 7,
                    "edition_type": "original",
                    "finish": "standard",
                    "price": 7000,
                }
            ]
        )
        resp1 = await ac.post("/orders", json=payload)
        assert resp1.status_code == 200

        # Second original purchase → should fail
        resp2 = await ac.post("/orders", json=payload)
        assert resp2.status_code == 409

    async def test_buy_print_when_prints_disabled(self, ac):
        """Artwork #5 (Digital Abstract) has has_prints=false → 409."""
        payload = _order_payload(
            items=[
                {
                    "artwork_id": 5,
                    "edition_type": "paper_print",
                    "finish": "glossy",
                    "price": 500,
                }
            ]
        )
        resp = await ac.post("/orders", json=payload)
        assert resp.status_code == 409


# ---------------------------------------------------------------------------
# DB Persistence
# ---------------------------------------------------------------------------


class TestDBPersistence:
    async def test_order_persisted_in_db(self, ac, db, delete_all_orders):
        """After creation, order and items are retrievable from the database."""
        payload = _order_payload(email="persist_test@example.com")
        resp = await ac.post("/orders", json=payload)
        assert resp.status_code == 200
        order_id = resp.json()["data"]["id"]

        # Directly query the database
        order = await db.orders.get_one(id=order_id)
        assert order is not None
        assert order.email == "persist_test@example.com"
        assert order.first_name == "Anna"
        assert order.total_price == 1500
        assert order.payment_status == "pending"

    async def test_order_items_persisted(self, ac, db, delete_all_orders):
        """Order items are correctly linked to the parent order."""
        payload = _order_payload(
            email="items_test@example.com",
            items=[
                {
                    "artwork_id": 6,
                    "edition_type": "paper_print",
                    "finish": "Rolled",
                    "size": "50x70",
                    "price": 1500,
                },
                {
                    "artwork_id": 1,
                    "edition_type": "paper_print",
                    "finish": "Framed",
                    "size": "30x40",
                    "price": 800,
                },
            ],
        )
        resp = await ac.post("/orders", json=payload)
        assert resp.status_code == 200
        order_id = resp.json()["data"]["id"]

        order = await db.orders.get_one(id=order_id)
        assert len(order.items) == 2
        artwork_ids = {item.artwork_id for item in order.items}
        assert artwork_ids == {6, 1}


# ---------------------------------------------------------------------------
# Order Tracking by Email
# ---------------------------------------------------------------------------


class TestOrderTrackingByEmail:
    async def test_track_orders_by_email(self, ac, delete_all_orders):
        """GET /orders/track?email=... returns orders for that email."""
        email = "track_test@example.com"
        # Create two orders with same email
        for _ in range(2):
            resp = await ac.post("/orders", json=_order_payload(email=email))
            assert resp.status_code == 200

        # Track by email
        resp = await ac.get(f"/orders/track?email={email}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "OK"
        assert len(data["data"]) == 2
        for order in data["data"]:
            assert "id" in order
            assert "payment_status" in order
            assert "items" in order
            assert order["items"][0]["edition_type"] == "paper_print"

    async def test_track_orders_no_results(self, ac):
        """Email with no orders returns empty list."""
        resp = await ac.get("/orders/track?email=nobody@nowhere.com")
        assert resp.status_code == 200
        assert resp.json()["data"] == []

    async def test_track_orders_invalid_email(self, ac):
        """Invalid email format returns empty list."""
        resp = await ac.get("/orders/track?email=notanemail")
        assert resp.status_code == 200
        assert resp.json()["data"] == []


# ---------------------------------------------------------------------------
# Payment Status Endpoint
# ---------------------------------------------------------------------------


class TestPaymentStatus:
    async def test_payment_status_returns_pending(self, ac, delete_all_orders):
        """Newly created order has 'pending' payment status."""
        resp = await ac.post("/orders", json=_order_payload())
        order_id = resp.json()["data"]["id"]

        status_resp = await ac.get(f"/payments/{order_id}/status")
        assert status_resp.status_code == 200
        data = status_resp.json()
        assert data["order_id"] == order_id
        assert data["payment_status"] == "pending"

    async def test_payment_status_not_found(self, ac):
        """Non-existent order returns 404."""
        resp = await ac.get("/payments/999999/status")
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Monobank Invoice Creation (Mocked)
# ---------------------------------------------------------------------------


class TestPaymentCreate:
    async def test_create_payment_mocked(self, ac, db, delete_all_orders):
        """POST /payments/create with mocked Monobank → invoice data stored."""
        # 1. Create a real order first
        resp = await ac.post("/orders", json=_order_payload())
        order_id = resp.json()["data"]["id"]

        # 2. Mock Monobank's create_invoice to simulate a successful response
        mock_invoice = {
            "invoiceId": "test_inv_001",
            "pageUrl": "https://pay.mbnk.biz/test_inv_001",
        }
        with patch(
            "src.api.payments.MonobankService.create_invoice",
            new_callable=AsyncMock,
            return_value=mock_invoice,
        ):
            pay_resp = await ac.post(
                "/payments/create",
                json={
                    "order_id": order_id,
                    "currency": "UAH",
                },
            )

        assert pay_resp.status_code == 200
        pay_data = pay_resp.json()
        assert pay_data["order_id"] == order_id
        assert pay_data["invoice_id"] == "test_inv_001"
        assert pay_data["payment_url"] == "https://pay.mbnk.biz/test_inv_001"

        # 3. Verify invoice data was persisted in the DB
        order = await db.orders.get_one(id=order_id)
        assert order.invoice_id == "test_inv_001"
        assert order.payment_url == "https://pay.mbnk.biz/test_inv_001"
        assert order.payment_status == "awaiting_payment"

    async def test_create_payment_nonexistent_order(self, ac):
        """Payment for non-existent order → 404."""
        with patch(
            "src.api.payments.MonobankService.create_invoice",
            new_callable=AsyncMock,
        ):
            resp = await ac.post(
                "/payments/create",
                json={
                    "order_id": 999999,
                    "currency": "UAH",
                },
            )
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Webhook Processing
# ---------------------------------------------------------------------------


class TestWebhookProcessing:
    async def _create_order_with_invoice(self, ac, db) -> tuple[int, str]:
        """Helper: creates an order and links a mock payment session."""
        resp = await ac.post("/orders", json=_order_payload(email="webhook@test.com"))
        order_id = resp.json()["data"]["id"]

        mock_invoice = {"invoiceId": "wh_inv_001", "pageUrl": "https://pay.mbnk.biz/wh"}
        with patch(
            "src.api.payments.MonobankService.create_invoice",
            new_callable=AsyncMock,
            return_value=mock_invoice,
        ):
            await ac.post("/payments/create", json={"order_id": order_id})

        return order_id, "wh_inv_001"

    def _webhook_patches(self, sig_valid: bool = True):
        """Context manager stack: patches MONOBANK_TOKEN + verify_webhook_signature."""
        from contextlib import contextmanager

        @contextmanager
        def _ctx():
            with (
                patch("src.api.payments.settings.MONOBANK_TOKEN", "test_token"),
                patch("src.api.payments.MonobankService.__init__", return_value=None),
                patch(
                    "src.api.payments.MonobankService.verify_webhook_signature",
                    new_callable=AsyncMock,
                    return_value=sig_valid,
                ),
            ):
                yield

        return _ctx()

    async def test_webhook_success_updates_to_paid(self, ac, db, delete_all_orders):
        """Monobank 'success' webhook → order.payment_status = 'paid'."""
        order_id, invoice_id = await self._create_order_with_invoice(ac, db)

        webhook_payload = {
            "invoiceId": invoice_id,
            "status": "success",
            "amount": 150000,
            "ccy": 980,
        }
        with self._webhook_patches(sig_valid=True):
            resp = await ac.post(
                "/payments/webhook",
                content=json.dumps(webhook_payload),
                headers={"Content-Type": "application/json", "X-Sign": "valid_signature"},
            )
        assert resp.status_code == 200

        # Verify order status updated
        order = await db.orders.get_one(id=order_id)
        assert order.payment_status == "paid"

    async def test_webhook_failure_updates_to_failed(self, ac, db, delete_all_orders):
        """Monobank 'failure' webhook → order.payment_status = 'failed'."""
        order_id, invoice_id = await self._create_order_with_invoice(ac, db)

        webhook_payload = {
            "invoiceId": invoice_id,
            "status": "failure",
            "amount": 150000,
            "ccy": 980,
            "failureReason": "Card declined",
            "errCode": "DECLINED",
        }
        with self._webhook_patches(sig_valid=True):
            resp = await ac.post(
                "/payments/webhook",
                content=json.dumps(webhook_payload),
                headers={"Content-Type": "application/json", "X-Sign": "valid_signature"},
            )
        assert resp.status_code == 200

        order = await db.orders.get_one(id=order_id)
        assert order.payment_status == "failed"

    async def test_webhook_idempotency(self, ac, db, delete_all_orders):
        """Sending the same 'success' webhook twice doesn't break anything."""
        order_id, invoice_id = await self._create_order_with_invoice(ac, db)

        webhook_payload = {
            "invoiceId": invoice_id,
            "status": "success",
            "amount": 150000,
            "ccy": 980,
        }

        with self._webhook_patches(sig_valid=True):
            # First webhook
            resp1 = await ac.post(
                "/payments/webhook",
                content=json.dumps(webhook_payload),
                headers={"Content-Type": "application/json", "X-Sign": "valid"},
            )
            assert resp1.status_code == 200

            # Second identical webhook — should not error
            resp2 = await ac.post(
                "/payments/webhook",
                content=json.dumps(webhook_payload),
                headers={"Content-Type": "application/json", "X-Sign": "valid"},
            )
            assert resp2.status_code == 200

        # Order should still be paid
        order = await db.orders.get_one(id=order_id)
        assert order.payment_status == "paid"

    async def test_webhook_no_downgrade_from_paid(self, ac, db, delete_all_orders):
        """Once 'paid', a subsequent 'processing' webhook must not downgrade status."""
        order_id, invoice_id = await self._create_order_with_invoice(ac, db)

        with self._webhook_patches(sig_valid=True):
            # Mark as paid
            await ac.post(
                "/payments/webhook",
                content=json.dumps(
                    {"invoiceId": invoice_id, "status": "success", "amount": 150000, "ccy": 980}
                ),
                headers={"Content-Type": "application/json", "X-Sign": "valid"},
            )

            # Try to downgrade to 'processing' — should be ignored
            await ac.post(
                "/payments/webhook",
                content=json.dumps(
                    {"invoiceId": invoice_id, "status": "processing", "amount": 150000, "ccy": 980}
                ),
                headers={"Content-Type": "application/json", "X-Sign": "valid"},
            )

        order = await db.orders.get_one(id=order_id)
        assert order.payment_status == "paid"

    async def test_webhook_invalid_signature(self, ac, db, delete_all_orders):
        """Bad X-Sign header → 403."""
        order_id, invoice_id = await self._create_order_with_invoice(ac, db)

        webhook_payload = {
            "invoiceId": invoice_id,
            "status": "success",
            "amount": 150000,
            "ccy": 980,
        }
        with self._webhook_patches(sig_valid=False):
            resp = await ac.post(
                "/payments/webhook",
                content=json.dumps(webhook_payload),
                headers={"Content-Type": "application/json", "X-Sign": "bad_signature"},
            )
        assert resp.status_code == 403
