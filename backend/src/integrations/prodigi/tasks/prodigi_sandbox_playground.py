from __future__ import annotations

import argparse
import asyncio
import json
from collections import Counter, defaultdict
from types import SimpleNamespace
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from src.config import settings
from src.database import new_session_null_pool
from src.integrations.prodigi.connectors.client import ProdigiClient
from src.integrations.prodigi.services.prodigi_attributes import normalize_prodigi_attributes
from src.integrations.prodigi.services.prodigi_order_assets import ProdigiOrderAssetService
from src.integrations.prodigi.services.prodigi_orders import ProdigiOrderService
from src.integrations.prodigi.services.prodigi_print_area_resolver import ProdigiPrintAreaResolver
from src.models.artworks import ArtworksOrm
from src.models.prodigi_storefront import (
    ProdigiStorefrontBakeOrm,
    ProdigiStorefrontOfferGroupOrm,
    ProdigiStorefrontOfferSizeOrm,
)


async def run_playground(
    *,
    artwork_id: int | None,
    countries: list[str],
    ratio: str | None,
    per_country: int,
    include_resize: bool,
    create_sandbox_order: bool,
) -> dict[str, Any]:
    async with new_session_null_pool() as session:
        bake = await _get_active_bake(session)
        if bake is None:
            return {"status": "failed", "reason": "No active Prodigi storefront bake found."}

        artwork = await _get_artwork(session, artwork_id) if artwork_id else None
        selected_ratio = ratio or _artwork_ratio(artwork)
        if selected_ratio is None:
            return {
                "status": "failed",
                "reason": "Pass --ratio or --artwork-id for an artwork with print_aspect_ratio.",
            }

        source_coverage = await _build_source_coverage(session, bake.id)
        samples = await _load_samples(
            session,
            bake_id=bake.id,
            ratio=selected_ratio,
            countries=[country.upper() for country in countries],
            per_country=per_country,
        )

        product_checks = []
        quote_checks = []
        if settings.PRODIGI_API_KEY:
            async with (
                ProdigiPrintAreaResolver() as resolver,
                ProdigiClient(sandbox=settings.PRODIGI_SANDBOX) as client,
            ):
                for sample in samples:
                    product_checks.append(await _check_product_details(resolver, sample))
                    quote_checks.append(await _check_quote(client, sample))
        else:
            product_checks.append(
                {
                    "status": "skipped",
                    "reason": "PRODIGI_API_KEY is not configured.",
                }
            )
            quote_checks.append(
                {
                    "status": "skipped",
                    "reason": "PRODIGI_API_KEY is not configured.",
                }
            )

        resize_checks: list[dict[str, Any]] = []
        sandbox_order_checks: list[dict[str, Any]] = []
        if include_resize:
            if artwork is None:
                resize_checks.append(
                    {
                        "status": "skipped",
                        "reason": "Pass --artwork-id to run resize smoke checks.",
                    }
                )
            else:
                resize_checks = await _run_resize_smoke(
                    session=session,
                    artwork_id=int(artwork.id),
                    samples=samples,
                )
        if create_sandbox_order:
            sandbox_order_checks = await _run_sandbox_order_smoke(
                session=session,
                artwork=artwork,
                sample=samples[0] if samples else None,
            )

        return {
            "status": _overall_status(
                product_checks + quote_checks + resize_checks + sandbox_order_checks
            ),
            "mode": "sandbox" if settings.PRODIGI_SANDBOX else "live",
            "safe_order_creation": "enabled" if create_sandbox_order else "disabled",
            "prodigi_contract": _prodigi_contract_summary(),
            "bake": {
                "id": bake.id,
                "bake_key": bake.bake_key,
                "paper_material": bake.paper_material,
                "status": bake.status,
            },
            "selection": {
                "artwork_id": int(artwork.id) if artwork else None,
                "ratio": selected_ratio,
                "countries": [country.upper() for country in countries],
                "per_country": per_country,
            },
            "source_coverage": source_coverage,
            "sample_count": len(samples),
            "product_details_checks": product_checks,
            "quote_checks": quote_checks,
            "resize_checks": resize_checks,
            "sandbox_order_checks": sandbox_order_checks,
        }


async def _get_active_bake(session) -> ProdigiStorefrontBakeOrm | None:
    result = await session.execute(
        select(ProdigiStorefrontBakeOrm)
        .where(ProdigiStorefrontBakeOrm.is_active.is_(True))
        .order_by(ProdigiStorefrontBakeOrm.id.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def _get_artwork(session, artwork_id: int | None) -> ArtworksOrm | None:
    if artwork_id is None:
        return None
    result = await session.execute(
        select(ArtworksOrm)
        .where(ArtworksOrm.id == artwork_id)
        .options(selectinload(ArtworksOrm.print_aspect_ratio))
    )
    return result.scalar_one_or_none()


def _artwork_ratio(artwork: ArtworksOrm | None) -> str | None:
    if artwork is None or artwork.print_aspect_ratio is None:
        return None
    return artwork.print_aspect_ratio.label


async def _build_source_coverage(session, bake_id: int) -> dict[str, Any]:
    rows = (
        await session.execute(
            select(ProdigiStorefrontOfferSizeOrm.print_area_source, func.count())
            .join(ProdigiStorefrontOfferSizeOrm.offer_group)
            .where(ProdigiStorefrontOfferGroupOrm.bake_id == bake_id)
            .group_by(ProdigiStorefrontOfferSizeOrm.print_area_source)
            .order_by(func.count().desc())
        )
    ).all()
    total = sum(int(count) for _source, count in rows)
    by_source = [
        {
            "source": source or "unknown",
            "count": int(count),
            "pct": round((int(count) / total) * 100, 4) if total else 0,
        }
        for source, count in rows
    ]
    return {"total": total, "by_source": by_source}


async def _load_samples(
    session,
    *,
    bake_id: int,
    ratio: str,
    countries: list[str],
    per_country: int,
) -> list[dict[str, Any]]:
    result = await session.execute(
        select(ProdigiStorefrontOfferGroupOrm)
        .where(
            ProdigiStorefrontOfferGroupOrm.bake_id == bake_id,
            ProdigiStorefrontOfferGroupOrm.ratio_label == ratio,
            ProdigiStorefrontOfferGroupOrm.destination_country.in_(countries),
        )
        .options(selectinload(ProdigiStorefrontOfferGroupOrm.sizes))
        .order_by(
            ProdigiStorefrontOfferGroupOrm.destination_country,
            ProdigiStorefrontOfferGroupOrm.category_id,
        )
    )
    groups = list(result.scalars().all())

    samples: list[dict[str, Any]] = []
    count_by_country: Counter[str] = Counter()
    seen_category_by_country: dict[str, set[str]] = defaultdict(set)
    for group in groups:
        if count_by_country[group.destination_country] >= per_country:
            continue
        if group.category_id in seen_category_by_country[group.destination_country]:
            continue
        size = _pick_largest_available_size(group.sizes)
        if size is None or not size.sku:
            continue
        seen_category_by_country[group.destination_country].add(group.category_id)
        count_by_country[group.destination_country] += 1
        samples.append(
            {
                "country": group.destination_country,
                "category_id": group.category_id,
                "slot_size_label": size.slot_size_label,
                "sku": size.sku,
                "attributes": _build_attributes(group),
                "shipping_method": size.shipping_method,
                "print_area": {
                    "width_px": size.print_area_width_px,
                    "height_px": size.print_area_height_px,
                    "name": size.print_area_name or "default",
                    "source": size.print_area_source,
                    "dimensions": size.print_area_dimensions,
                    "supplier_size_inches": size.supplier_size_inches,
                    "supplier_size_cm": size.supplier_size_cm,
                },
            }
        )
    return samples


def _pick_largest_available_size(sizes: list[Any]) -> Any | None:
    available = [
        size
        for size in sizes
        if size.available and size.print_area_width_px and size.print_area_height_px
    ]
    if not available:
        return None
    return max(
        available,
        key=lambda size: int(size.print_area_width_px) * int(size.print_area_height_px),
    )


def _build_attributes(group: ProdigiStorefrontOfferGroupOrm) -> dict[str, Any]:
    attributes: dict[str, Any] = {}
    if isinstance(group.fixed_attributes, dict):
        attributes.update(group.fixed_attributes)
    if isinstance(group.recommended_defaults, dict):
        attributes.update(group.recommended_defaults)
    if isinstance(group.allowed_attributes, dict):
        for key, values in group.allowed_attributes.items():
            if key in attributes:
                continue
            if isinstance(values, list) and values:
                attributes[key] = values[0]
    return normalize_prodigi_attributes(attributes)


async def _check_product_details(
    resolver: ProdigiPrintAreaResolver,
    sample: dict[str, Any],
) -> dict[str, Any]:
    live = await resolver.resolve(
        sku=sample["sku"],
        destination_country=sample["country"],
        category_id=sample["category_id"],
        attributes=sample["attributes"],
        optional_attribute_keys=set(),
        supplier_size_inches=sample["print_area"].get("supplier_size_inches"),
        supplier_size_cm=sample["print_area"].get("supplier_size_cm"),
        slot_size_label=sample["slot_size_label"],
        wrap_margin_pct=0.0,
    )
    live_width = live.get("print_area_width_px")
    live_height = live.get("print_area_height_px")
    baked_width = sample["print_area"].get("width_px")
    baked_height = sample["print_area"].get("height_px")
    matches = live_width == baked_width and live_height == baked_height
    return {
        "status": "passed" if matches else "failed",
        "country": sample["country"],
        "category_id": sample["category_id"],
        "sku": sample["sku"],
        "attributes": sample["attributes"],
        "baked_px": [baked_width, baked_height],
        "live_px": [live_width, live_height],
        "print_area_name": live.get("print_area_name"),
        "print_area_source": live.get("print_area_source"),
    }


async def _check_quote(client: ProdigiClient, sample: dict[str, Any]) -> dict[str, Any]:
    try:
        response = await client.get_quote(
            sample["sku"],
            sample["country"],
            "EUR",
            sample["attributes"],
            "Standard",
            sample["print_area"].get("name") or "default",
        )
        outcome = response.get("outcome")
        return {
            "status": "passed" if outcome in {"Created", "Ok", "OK"} else "failed",
            "country": sample["country"],
            "category_id": sample["category_id"],
            "sku": sample["sku"],
            "outcome": outcome,
            "quote_count": len(response.get("quotes") or []),
        }
    except Exception as exc:
        response = getattr(exc, "response", None)
        return {
            "status": "failed",
            "country": sample["country"],
            "category_id": sample["category_id"],
            "sku": sample["sku"],
            "error": str(exc),
            "response_body": response.text if response is not None else None,
        }


async def _run_resize_smoke(
    *,
    session,
    artwork_id: int,
    samples: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    service = ProdigiOrderAssetService(session)
    checks: list[dict[str, Any]] = []
    for index, sample in enumerate(samples, start=1):
        try:
            rendered = await service.prepare_order_asset(
                order_id=0,
                order_item_id=index,
                artwork_id=artwork_id,
                category_id=sample["category_id"],
                slot_size_label=sample["slot_size_label"],
                sku=sample["sku"],
                country_code=sample["country"],
                attributes=sample["attributes"],
            )
            checks.append(
                {
                    "status": "passed" if rendered else "failed",
                    "country": sample["country"],
                    "category_id": sample["category_id"],
                    "sku": sample["sku"],
                    "file_path": rendered.get("file_path") if rendered else None,
                    "rendered_px": [rendered.get("width_px"), rendered.get("height_px")]
                    if rendered
                    else None,
                    "prodigi_verified": rendered.get("prodigi_verified") if rendered else False,
                }
            )
        except Exception as exc:
            checks.append(
                {
                    "status": "failed",
                    "country": sample["country"],
                    "category_id": sample["category_id"],
                    "sku": sample["sku"],
                    "error": str(exc),
                }
            )
    return checks


async def _run_sandbox_order_smoke(
    *,
    session,
    artwork: ArtworksOrm | None,
    sample: dict[str, Any] | None,
) -> list[dict[str, Any]]:
    if not settings.PRODIGI_SANDBOX:
        return [
            {
                "status": "failed",
                "reason": "Refusing to create an order unless PRODIGI_SANDBOX=true.",
            }
        ]
    if not settings.PRODIGI_API_KEY:
        return [{"status": "failed", "reason": "PRODIGI_API_KEY is not configured."}]
    if not _is_public_http_url(settings.PUBLIC_BASE_URL):
        return [
            {
                "status": "failed",
                "reason": (
                    "PUBLIC_BASE_URL must be a public http(s) URL so Prodigi can download "
                    "the rendered print asset."
                ),
                "current_public_base_url": settings.PUBLIC_BASE_URL,
            }
        ]
    if artwork is None or sample is None:
        return [
            {
                "status": "failed",
                "reason": "Pass --artwork-id and at least one matching sample to create sandbox order.",
            }
        ]

    service = ProdigiOrderAssetService(session)
    rendered = await service.prepare_order_asset(
        order_id=0,
        order_item_id=1,
        artwork_id=int(artwork.id),
        category_id=sample["category_id"],
        slot_size_label=sample["slot_size_label"],
        sku=sample["sku"],
        country_code=sample["country"],
        attributes=sample["attributes"],
    )
    if not rendered:
        return [{"status": "failed", "reason": "Could not render order asset from master."}]

    asset_url = ProdigiOrderService._public_asset_url(rendered["file_url"])
    fake_order = _build_fake_order(country=sample["country"])
    fake_item = _build_fake_item(sample)
    payload = ProdigiOrderService.build_order_payload(
        order=fake_order,
        item=fake_item,
        asset_url=asset_url or "",
        print_area_name=rendered.get("print_area_name") or "default",
        merchant_reference=f"artshop-sandbox-artwork-{artwork.id}-{sample['sku']}",
        idempotency_key=f"artshop-sandbox-artwork-{artwork.id}-{sample['sku']}",
        callback_url=ProdigiOrderService._callback_url(),
    )

    async with ProdigiClient(sandbox=True) as client:
        try:
            create_response = await client.post("/orders", payload)
        except Exception as exc:
            response = getattr(exc, "response", None)
            return [
                {
                    "status": "failed",
                    "stage": "create_order",
                    "payload_sent": _redact_payload(payload),
                    "error": str(exc),
                    "response_body": response.text if response is not None else None,
                }
            ]

        prodigi_order_id = (create_response.get("order") or {}).get("id")
        fetched_order = await client.get_order(prodigi_order_id) if prodigi_order_id else None

    return [
        {
            "status": "passed" if create_response.get("outcome") == "Created" else "failed",
            "stage": "create_order",
            "payload_sent": _redact_payload(payload),
            "rendered_asset": {
                "file_url": rendered.get("file_url"),
                "width_px": rendered.get("width_px"),
                "height_px": rendered.get("height_px"),
                "print_area_name": rendered.get("print_area_name"),
                "print_area_source": rendered.get("print_area_source"),
                "prodigi_verified": rendered.get("prodigi_verified"),
            },
            "create_response_summary": _summarize_order_response(create_response),
            "get_order_response_summary": _summarize_order_response(fetched_order or {}),
            "raw_create_response": create_response,
        }
    ]


def _build_fake_order(*, country: str) -> SimpleNamespace:
    return SimpleNamespace(
        id=0,
        first_name="Sandbox",
        last_name="Buyer",
        email="sandbox-buyer@example.com",
        phone="+15555550100",
        shipping_phone="+15555550100",
        shipping_address_line1="123 Sandbox Street",
        shipping_address_line2="",
        shipping_postal_code=_postal_code_for_country(country),
        shipping_country_code=country,
        shipping_city=_city_for_country(country),
        shipping_state="",
    )


def _build_fake_item(sample: dict[str, Any]) -> SimpleNamespace:
    return SimpleNamespace(
        id=1,
        prodigi_sku=sample["sku"],
        prodigi_attributes=sample["attributes"],
        prodigi_shipping_method="Standard",
    )


def _city_for_country(country: str) -> str:
    return {
        "DE": "Berlin",
        "GB": "London",
        "US": "New York",
        "CA": "Toronto",
        "AU": "Sydney",
    }.get(country.upper(), "Berlin")


def _postal_code_for_country(country: str) -> str:
    return {
        "DE": "10115",
        "GB": "SW1A 1AA",
        "US": "10001",
        "CA": "M5V 2T6",
        "AU": "2000",
    }.get(country.upper(), "10115")


def _is_public_http_url(value: str | None) -> bool:
    if not value:
        return False
    normalized = value.lower()
    return (
        normalized.startswith("https://")
        and "localhost" not in normalized
        and "127.0.0.1" not in normalized
    )


def _redact_payload(payload: dict[str, Any]) -> dict[str, Any]:
    return json.loads(json.dumps(payload))


def _summarize_order_response(response: dict[str, Any]) -> dict[str, Any]:
    order = response.get("order") or response
    status = order.get("status") or {}
    return {
        "outcome": response.get("outcome"),
        "order_id": order.get("id"),
        "stage": status.get("stage"),
        "status_details": status.get("details"),
        "issues": status.get("issues") or [],
        "charges": order.get("charges") or [],
        "shipments": order.get("shipments") or [],
    }


def _prodigi_contract_summary() -> dict[str, Any]:
    return {
        "order_endpoint": "POST /v4.0/orders",
        "status_endpoint": "GET /v4.0/orders/{id}",
        "required_payload_we_send": [
            "shippingMethod",
            "merchantReference",
            "idempotencyKey",
            "recipient.name",
            "recipient.address",
            "items[].sku",
            "items[].copies",
            "items[].sizing",
            "items[].attributes",
            "items[].assets[].printArea",
            "items[].assets[].url",
        ],
        "expected_response_fields_we_check": [
            "outcome",
            "order.id",
            "order.status.stage",
            "order.status.details",
            "order.status.issues",
            "order.charges",
            "order.shipments",
        ],
        "failure_surfaces": [
            "HTTP 400 ValidationFailed for bad SKU/country/attributes/asset payload",
            "HTTP 401 for missing or wrong API key",
            "status.issues such as asset download failures or payment authorisation",
            "awaitingPayment status when Prodigi requires payment authorisation",
            "shipments missing until dispatch/tracking exists",
        ],
    }


def _overall_status(checks: list[dict[str, Any]]) -> str:
    if any(check.get("status") == "failed" for check in checks):
        return "failed"
    if checks and all(check.get("status") == "skipped" for check in checks):
        return "skipped"
    return "passed"


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run safe Prodigi sandbox/playground checks without creating orders."
    )
    parser.add_argument("--artwork-id", type=int)
    parser.add_argument("--ratio", help="Ratio label, e.g. 4:5. Defaults to artwork ratio.")
    parser.add_argument(
        "--country",
        action="append",
        default=[],
        help="Destination country. Can be passed multiple times.",
    )
    parser.add_argument("--per-country", type=int, default=4)
    parser.add_argument(
        "--include-resize",
        action="store_true",
        help="Also render order assets locally. This can be slow for large masters.",
    )
    parser.add_argument(
        "--create-sandbox-order",
        action="store_true",
        help="Create one real Prodigi sandbox order. Requires PRODIGI_SANDBOX=true and public PUBLIC_BASE_URL.",
    )
    args = parser.parse_args()

    countries = args.country or ["DE", "GB", "US", "CA", "AU"]
    report = asyncio.run(
        run_playground(
            artwork_id=args.artwork_id,
            countries=countries,
            ratio=args.ratio,
            per_country=args.per_country,
            include_resize=args.include_resize,
            create_sandbox_order=args.create_sandbox_order,
        )
    )
    print(json.dumps(report, indent=2, ensure_ascii=False, default=str))


if __name__ == "__main__":
    main()
