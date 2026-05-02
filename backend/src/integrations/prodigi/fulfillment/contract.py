from __future__ import annotations

import hashlib
import json
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

from src.config import settings
from src.integrations.prodigi.services.prodigi_attributes import normalize_prodigi_attributes

ALLOWED_SHIPPING_METHODS = {"Budget", "Standard", "StandardPlus", "Express", "Overnight"}


class ProdigiPayloadValidationError(ValueError):
    def __init__(self, errors: list[str]):
        self.errors = errors
        super().__init__("; ".join(errors))


def build_order_payload(
    *,
    order: Any,
    prepared_items: list[Any],
    job_id: int | None,
    merchant_reference: str,
    idempotency_key: str,
    callback_url: str | None,
    mode: str,
) -> dict[str, Any]:
    if not prepared_items:
        raise ProdigiPayloadValidationError(["At least one prepared print item is required."])

    first_item = prepared_items[0].item
    body: dict[str, Any] = {
        "merchantReference": merchant_reference,
        "idempotencyKey": idempotency_key,
        "shippingMethod": canonical_shipping_method(
            getattr(first_item, "prodigi_shipping_method", None)
        ),
        "recipient": _recipient_payload(order),
        "items": [_item_payload(order=order, prepared=prepared) for prepared in prepared_items],
        "metadata": _metadata_payload(
            order=order,
            prepared_items=prepared_items,
            job_id=job_id,
            mode=mode,
        ),
    }
    if callback_url:
        body["callbackUrl"] = callback_url

    body["metadata"]["payloadHash"] = stable_payload_hash(body)
    validate_order_payload(body)
    return body


def validate_order_payload(payload: dict[str, Any]) -> None:
    errors: list[str] = []
    for key in ("merchantReference", "idempotencyKey", "shippingMethod", "recipient", "items"):
        if not payload.get(key):
            errors.append(f"Missing required top-level field: {key}")
    if payload.get("shippingMethod") not in ALLOWED_SHIPPING_METHODS:
        errors.append(f"Unsupported shippingMethod: {payload.get('shippingMethod')}")

    recipient = payload.get("recipient") if isinstance(payload.get("recipient"), dict) else {}
    address = recipient.get("address") if isinstance(recipient.get("address"), dict) else {}
    for key in ("name", "address"):
        if not recipient.get(key):
            errors.append(f"Missing recipient.{key}")
    for key in ("line1", "postalOrZipCode", "countryCode", "townOrCity"):
        if not address.get(key):
            errors.append(f"Missing recipient.address.{key}")

    items = payload.get("items")
    if not isinstance(items, list) or not items:
        errors.append("items must contain at least one item")
    else:
        for index, item in enumerate(items, start=1):
            _validate_item_payload(errors, item, index)

    if errors:
        raise ProdigiPayloadValidationError(errors)


def canonical_shipping_method(value: str | None) -> str:
    normalized = (value or "Standard").strip().lower()
    return {
        "budget": "Budget",
        "express": "Express",
        "overnight": "Overnight",
        "standard": "Standard",
        "standardplus": "StandardPlus",
        "standard plus": "StandardPlus",
        "standard_plus": "StandardPlus",
    }.get(normalized, "Standard")


def callback_url() -> str | None:
    if not settings.PUBLIC_BASE_URL:
        return None
    base = f"{settings.PUBLIC_BASE_URL}/api/v1/webhooks/prodigi"
    if not settings.PRODIGI_WEBHOOK_SECRET:
        return base
    return f"{base}?{urlencode({'token': settings.PRODIGI_WEBHOOK_SECRET})}"


def public_asset_url(file_url: str | None) -> str | None:
    if not file_url:
        return None
    if file_url.startswith("http://") or file_url.startswith("https://"):
        return file_url
    if file_url.startswith("/"):
        return f"{settings.PUBLIC_BASE_URL}{file_url}"
    return file_url


def stable_payload_hash(payload: dict[str, Any]) -> str:
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str).encode()
    return hashlib.sha256(encoded).hexdigest()


def file_md5(path: str | None) -> str | None:
    if not path:
        return None
    file_path = Path(path)
    if not file_path.exists():
        return None
    digest = hashlib.md5()  # nosec B324 - required by Prodigi asset contract.
    with file_path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _recipient_payload(order: Any) -> dict[str, Any]:
    address: dict[str, Any] = {
        "line1": order.shipping_address_line1 or "",
        "postalOrZipCode": order.shipping_postal_code or "",
        "countryCode": (order.shipping_country_code or "US").upper(),
        "townOrCity": order.shipping_city or "",
    }
    if order.shipping_address_line2 and order.shipping_address_line2.strip():
        address["line2"] = order.shipping_address_line2.strip()
    if order.shipping_state and order.shipping_state.strip():
        address["stateOrCounty"] = order.shipping_state.strip()

    recipient: dict[str, Any] = {
        "name": f"{order.first_name} {order.last_name}".strip(),
        "address": address,
    }
    if order.email:
        recipient["email"] = order.email
    phone = order.shipping_phone or order.phone
    if phone:
        recipient["phoneNumber"] = phone
    return recipient


def _item_payload(*, order: Any, prepared: Any) -> dict[str, Any]:
    item = prepared.item
    rendered = prepared.rendered or {}
    asset_url = prepared.asset_url
    md5_hash = rendered.get("md5_hash") or file_md5(rendered.get("file_path"))
    if md5_hash:
        rendered["md5_hash"] = md5_hash

    asset: dict[str, Any] = {
        "printArea": rendered.get("print_area_name") or "default",
        "url": asset_url,
    }
    if md5_hash:
        asset["md5Hash"] = md5_hash

    payload: dict[str, Any] = {
        "merchantReference": f"artshop-order-{order.id}-item-{item.id}",
        "sku": item.prodigi_sku,
        "copies": 1,
        "sizing": "fillPrintArea",
        "recipientCost": _recipient_cost(item),
        "attributes": normalize_prodigi_attributes(item.prodigi_attributes),
        "assets": [asset],
    }
    return payload


def _recipient_cost(item: Any) -> dict[str, str]:
    amount = getattr(item, "customer_line_total", None)
    if amount is None:
        amount = getattr(item, "price", 0) or 0
    rounded = Decimal(str(amount)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return {
        "amount": f"{rounded:.2f}",
        "currency": (getattr(item, "customer_currency", None) or "USD").upper(),
    }


def _metadata_payload(
    *,
    order: Any,
    prepared_items: list[Any],
    job_id: int | None,
    mode: str,
) -> dict[str, Any]:
    storefront_bake_ids = sorted(
        {
            int(value)
            for value in (
                getattr(prepared.item, "prodigi_storefront_bake_id", None)
                for prepared in prepared_items
            )
            if value is not None
        }
    )
    policy_versions = sorted(
        {
            str(value)
            for value in (
                getattr(prepared.item, "prodigi_storefront_policy_version", None)
                for prepared in prepared_items
            )
            if value
        }
    )
    return {
        "artshopOrderId": str(order.id),
        "checkoutGroupId": getattr(order, "checkout_group_id", None),
        "fulfillmentJobId": str(job_id) if job_id is not None else None,
        "storefrontBakeId": storefront_bake_ids[0] if storefront_bake_ids else None,
        "storefrontPolicyVersion": policy_versions[0] if policy_versions else None,
        "environment": mode,
    }


def _validate_item_payload(errors: list[str], item: Any, index: int) -> None:
    if not isinstance(item, dict):
        errors.append(f"items[{index}] must be an object")
        return
    for key in ("merchantReference", "sku", "copies", "sizing", "assets"):
        if not item.get(key):
            errors.append(f"items[{index}] missing {key}")
    if item.get("sizing") not in {"fillPrintArea", "fitPrintArea", "stretchToPrintArea"}:
        errors.append(f"items[{index}] has unsupported sizing")
    if item.get("copies") != 1:
        errors.append(f"items[{index}] copies must be 1")
    assets = item.get("assets")
    if not isinstance(assets, list) or not assets:
        errors.append(f"items[{index}] must contain at least one asset")
        return
    for asset_index, asset in enumerate(assets, start=1):
        if not isinstance(asset, dict):
            errors.append(f"items[{index}].assets[{asset_index}] must be an object")
            continue
        if not asset.get("printArea"):
            errors.append(f"items[{index}].assets[{asset_index}] missing printArea")
        if not asset.get("url"):
            errors.append(f"items[{index}].assets[{asset_index}] missing url")
