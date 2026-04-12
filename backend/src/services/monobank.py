"""
Monobank Acquiring API client service.

Handles all communication with the Monobank payment gateway, including:
- Invoice creation for payment processing.
- Invoice status polling.
- Webhook signature verification using ECDSA cryptography.
- Public key retrieval and caching.

Security: The merchant token (X-Token) is loaded exclusively from environment
variables and is never exposed to client-side code.

API Reference: https://api.monobank.ua/docs/acquiring.html
"""

import base64
import hashlib
from typing import Any

import ecdsa
import httpx
from loguru import logger

from src.config import settings
from src.exeptions import MonobankServiceError

# ISO 4217 numeric codes for supported currencies.
CURRENCY_CODES: dict[str, int] = {
    "UAH": 980,
    "USD": 840,
    "EUR": 978,
}


class MonobankService:
    """
    Stateless client for Monobank's Internet Acquiring REST API.

    All methods use short-lived httpx.AsyncClient instances to avoid
    connection pool exhaustion in long-running server processes.

    Attributes:
        _api_url: Base URL for the Monobank API.
        _token: Merchant authentication token (X-Token header).
        _cached_pubkey: In-memory cache for the ECDSA public key used
                        to verify webhook signatures.
    """

    _cached_pubkey: str | None = None

    def __init__(self) -> None:
        """
        Initializes the service with configuration from environment variables.

        Raises:
            ValueError: If the MONOBANK_TOKEN is not configured.
        """
        if not settings.MONOBANK_TOKEN:
            raise ValueError(
                "MONOBANK_TOKEN is not configured. "
                "Set it in the .env file to enable payment processing."
            )
        self._api_url = settings.MONOBANK_API_URL
        self._token = settings.MONOBANK_TOKEN

    @property
    def _headers(self) -> dict[str, str]:
        """
        Returns the standard authentication headers required by all Monobank API calls.
        """
        return {"X-Token": self._token}

    async def create_invoice(
        self,
        amount_coins: int,
        currency: str = "UAH",
        order_reference: str | None = None,
        destination: str | None = None,
        basket_items: list[dict[str, Any]] | None = None,
        customer_emails: list[str] | None = None,
        redirect_url: str | None = None,
        webhook_url: str | None = None,
        validity_seconds: int = 3600,
    ) -> dict[str, str]:
        """
        Creates a payment invoice on Monobank's acquiring platform.

        The returned 'pageUrl' should be used to redirect the buyer to
        the Monobank-hosted payment page.

        Args:
            amount_coins: Total payment amount in the currency's smallest unit
                          (e.g., kopiykas for UAH: 4200 UAH = 420000).
            currency: ISO 4217 alpha-3 currency code ('UAH', 'USD', 'EUR').
            order_reference: Unique merchant-defined reference for the order.
            destination: Human-readable description shown on the payment page.
            basket_items: Optional list of items for the payment receipt.
            customer_emails: Optional list of customer emails for receipt delivery.
            redirect_url: URL to redirect buyer after payment (overrides default).
            webhook_url: URL for status change callbacks (overrides default).
            validity_seconds: Invoice TTL in seconds (default: 1 hour).

        Returns:
            Dictionary with 'invoiceId' and 'pageUrl' keys.

        Raises:
            MonobankServiceError: If the Monobank API returns a non-200 response.
        """
        ccy_code = CURRENCY_CODES.get(currency.upper())
        if ccy_code is None:
            raise ValueError(f"Unsupported currency: {currency}")

        payload: dict[str, Any] = {
            "amount": amount_coins,
            "ccy": ccy_code,
            "validity": validity_seconds,
        }

        # Build the merchant payment info block.
        merchant_info: dict[str, Any] = {}
        if order_reference:
            merchant_info["reference"] = order_reference
        if destination:
            merchant_info["destination"] = destination
            merchant_info["comment"] = destination
        if basket_items:
            merchant_info["basketOrder"] = basket_items
        if customer_emails:
            merchant_info["customerEmails"] = customer_emails
        if merchant_info:
            payload["merchantPaymInfo"] = merchant_info

        # Apply redirect and webhook URLs with fallback to global defaults.
        payload["redirectUrl"] = redirect_url or settings.MONOBANK_REDIRECT_URL
        payload["webHookUrl"] = webhook_url or settings.MONOBANK_WEBHOOK_URL

        logger.info(
            "Creating Monobank invoice: amount={} ccy={} ref={}",
            amount_coins,
            currency,
            order_reference,
        )
        logger.debug("Monobank invoice payload: {}", payload)

        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                f"{self._api_url}/api/merchant/invoice/create",
                json=payload,
                headers=self._headers,
            )

        if response.status_code != 200:
            error_detail = response.text
            logger.error(
                "Monobank invoice creation failed: status={} body={}",
                response.status_code,
                error_detail,
            )
            raise MonobankServiceError(response.status_code, error_detail)

        data = response.json()
        logger.info(
            "Monobank invoice created: invoiceId={} pageUrl={}",
            data.get("invoiceId"),
            data.get("pageUrl"),
        )
        return data

    async def get_invoice_status(self, invoice_id: str) -> dict[str, Any]:
        """
        Retrieves the current status of a payment invoice.

        Useful for polling-based verification when webhooks are unreliable
        or for administrative status checks.

        Args:
            invoice_id: The Monobank-assigned invoice identifier.

        Returns:
            Full invoice status dictionary from the Monobank API.

        Raises:
            MonobankServiceError: If the Monobank API returns a non-200 response.
        """
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{self._api_url}/api/merchant/invoice/status",
                params={"invoiceId": invoice_id},
                headers=self._headers,
            )

        if response.status_code != 200:
            raise MonobankServiceError(response.status_code, response.text)

        return response.json()

    async def _get_public_key(self) -> str:
        """
        Retrieves the ECDSA public key from Monobank for webhook signature verification.

        The key is cached in-memory after the first successful retrieval.
        It should only be refreshed when signature verification starts failing,
        indicating that Monobank has rotated their key.

        Returns:
            Base64-encoded ECDSA public key string.

        Raises:
            MonobankServiceError: If the key cannot be retrieved.
        """
        if self._cached_pubkey:
            return self._cached_pubkey

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{self._api_url}/api/merchant/pubkey",
                headers=self._headers,
            )

        if response.status_code != 200:
            raise MonobankServiceError(response.status_code, response.text)

        key_data = response.json()
        self._cached_pubkey = key_data["key"]
        logger.info("Monobank ECDSA public key retrieved and cached.")
        return self._cached_pubkey

    async def verify_webhook_signature(self, body: bytes, x_sign: str) -> bool:
        """
        Verifies the ECDSA signature of an incoming Monobank webhook request.

        This is a CRITICAL security check. Without it, an attacker could forge
        webhook requests and falsely mark orders as paid.

        The verification process:
        1. Retrieves (or uses cached) Monobank's ECDSA public key.
        2. Decodes the Base64-encoded public key PEM and the X-Sign signature.
        3. Verifies the signature against a SHA-256 hash of the raw request body.
        4. If verification fails with the cached key, retries with a fresh key
           (handles key rotation gracefully).

        Args:
            body: The raw bytes of the webhook request body (not parsed JSON).
            x_sign: The value of the X-Sign header from the webhook request.

        Returns:
            True if the signature is valid, False otherwise.
        """
        for attempt in range(2):
            try:
                pub_key_base64 = await self._get_public_key()
                pub_key_bytes = base64.b64decode(pub_key_base64)
                signature_bytes = base64.b64decode(x_sign)

                pub_key = ecdsa.VerifyingKey.from_pem(pub_key_bytes.decode())
                pub_key.verify(
                    signature_bytes,
                    body,
                    sigdecode=ecdsa.util.sigdecode_der,
                    hashfunc=hashlib.sha256,
                )
                return True

            except ecdsa.BadSignatureError:
                if attempt == 0:
                    # Key may have rotated — clear cache and retry with a fresh key.
                    logger.warning(
                        "Webhook signature verification failed with cached key. "
                        "Retrying with a fresh public key."
                    )
                    self._cached_pubkey = None
                    continue
                logger.error(
                    "Webhook signature verification failed after key refresh. "
                    "Potential forgery attempt."
                )
                return False

            except Exception as e:
                logger.error("Unexpected error during webhook signature verification: {}", e)
                return False

        return False
