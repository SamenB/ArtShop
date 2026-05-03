"""
Pydantic schemas for payment processing and Monobank webhook handling.

Defines the data contracts between the frontend checkout flow,
the backend payment service, and the Monobank acquiring API.
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class PaymentCreateRequest(BaseModel):
    """
    Inbound request from the frontend to initiate a payment session.

    The order_id must reference an existing order that has already been
    persisted with 'pending' payment status via the standard /orders endpoint.
    """

    order_id: int = Field(..., description="ID of the existing order to pay for.")
    currency: str = Field(
        default="UAH",
        description="ISO 4217 alpha-3 currency code: 'UAH', 'USD', or 'EUR'.",
        pattern="^(UAH|USD|EUR)$",
    )
    amount_coins: Optional[int] = Field(
        default=None,
        description=(
            "Deprecated compatibility field. The backend ignores this value "
            "and derives the gateway amount from the stored order total."
        ),
    )


class PaymentCreateResponse(BaseModel):
    """
    Response sent to the frontend after a Monobank invoice is successfully created.

    The frontend should redirect the buyer to 'payment_url' to complete payment.
    """

    order_id: int
    order_reference: str
    invoice_id: str = Field(..., description="Monobank-assigned invoice identifier.")
    payment_url: str = Field(
        ..., description="URL of the Monobank payment page for buyer redirect."
    )


class MonobankWebhookPayload(BaseModel):
    """
    Structure of the JSON body sent by Monobank in webhook callbacks.

    Monobank sends this payload via POST when an invoice status changes.
    Note: Webhooks may arrive out of order — use 'modifiedDate' to determine
    the most recent status, not arrival order.

    Reference: https://api.monobank.ua/docs/acquiring.html
    """

    invoiceId: str = Field(..., description="Monobank invoice identifier.")
    status: str = Field(
        ...,
        description=(
            "Current invoice status: "
            "'created', 'processing', 'hold', 'success', 'failure', 'reversed'."
        ),
    )
    failureReason: Optional[str] = Field(
        default=None, description="Human-readable reason if the payment failed."
    )
    errCode: Optional[str] = Field(default=None, description="Bank error code on failure.")
    amount: int = Field(..., description="Original amount in smallest currency unit.")
    ccy: int = Field(..., description="ISO 4217 numeric currency code.")
    finalAmount: Optional[int] = Field(
        default=None, description="Final charged amount after holds/partial refunds."
    )
    createdDate: Optional[str] = None
    modifiedDate: Optional[str] = None
    reference: Optional[str] = Field(default=None, description="Merchant-defined order reference.")


class PaymentStatusResponse(BaseModel):
    """
    Simplified payment status response for the frontend.
    """

    order_id: int
    order_reference: str
    payment_status: str
    invoice_id: Optional[str] = None
