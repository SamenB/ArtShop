from __future__ import annotations

import json
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from itertools import cycle, islice
from pathlib import Path
from types import SimpleNamespace
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from src.config import settings
from src.integrations.prodigi.connectors.client import ProdigiClient
from src.integrations.prodigi.services.prodigi_attributes import normalize_prodigi_attributes
from src.integrations.prodigi.services.prodigi_orders import ProdigiOrderService
from src.integrations.prodigi.services.prodigi_print_area_resolver import (
    ProdigiPrintAreaResolver,
)
from src.models.prodigi_storefront import (
    ProdigiStorefrontBakeOrm,
    ProdigiStorefrontOfferGroupOrm,
    ProdigiStorefrontOfferSizeOrm,
)

KEY_COUNTRIES = ["DE", "GB", "US", "CA", "AU"]
CHECK_PASSED = "passed"
CHECK_FAILED = "failed"
CHECK_SKIPPED = "skipped"


@dataclass(slots=True)
class ValidationThresholds:
    min_samples: int = 1
    min_simulated_orders: int = 1
    max_failures: int = 0
    min_pass_rate: float = 1.0
    require_api_checks: bool = False


@dataclass(slots=True)
class ValidationConfig:
    countries: list[str]
    ratios: list[str] | None = None
    categories: list[str] | None = None
    max_sizes_per_group: int = 0
    simulate_orders: int = 1500
    batch_size: int = 3
    include_api_checks: bool = False
    include_quotes: bool = False
    thresholds: ValidationThresholds = field(default_factory=ValidationThresholds)
    output_path: str | None = None


@dataclass(slots=True)
class ValidationSample:
    country: str
    ratio: str
    category_id: str
    group_id: int
    size_id: int
    slot_size_label: str
    size_label: str | None
    sku: str | None
    attributes: dict[str, Any]
    shipping_method: str | None
    width_px: int | None
    height_px: int | None
    print_area_name: str | None
    print_area_source: str | None
    supplier_size_inches: str | None
    supplier_size_cm: str | None
    product_price: float | None
    shipping_price: float | None
    total_cost: float | None


class ProdigiFulfillmentValidationService:
    """
    Safe, repeatable validation harness for the Prodigi fulfillment contract.

    It never creates real or sandbox orders. It samples the active baked catalog,
    validates every selected offer, optionally cross-checks Prodigi API product
    details/quotes, and simulates ArtShop order payloads locally.
    """

    def __init__(self, db_session):
        self.db_session = db_session

    async def run(self, config: ValidationConfig) -> dict[str, Any]:
        bake = await self._get_active_bake()
        if bake is None:
            return self._build_empty_report(config, "No active Prodigi storefront bake found.")

        samples = await self._load_samples(bake, config)
        checks: list[dict[str, Any]] = []
        for sample in samples:
            checks.extend(self._run_static_sample_checks(sample))

        api_enabled = bool(config.include_api_checks and settings.PRODIGI_API_KEY)
        if config.include_api_checks and not settings.PRODIGI_API_KEY:
            checks.append(
                self._check(
                    "api_configuration",
                    CHECK_SKIPPED,
                    measured={"api_key_present": False},
                    expected={"api_key_present": True},
                    error="PRODIGI_API_KEY is not configured.",
                )
            )

        if api_enabled:
            checks.extend(await self._run_api_checks(samples, include_quotes=config.include_quotes))

        simulated_orders = self._simulate_order_payloads(samples, config)
        checks.extend(simulated_orders["checks"])

        report = self._build_report(
            config=config,
            bake=bake,
            samples=samples,
            checks=checks,
            simulated_orders=simulated_orders,
        )
        if config.output_path:
            self._write_report(report, config.output_path)
        return report

    async def _get_active_bake(self) -> ProdigiStorefrontBakeOrm | None:
        result = await self.db_session.execute(
            select(ProdigiStorefrontBakeOrm)
            .where(ProdigiStorefrontBakeOrm.is_active.is_(True))
            .order_by(ProdigiStorefrontBakeOrm.id.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def _load_samples(
        self,
        bake: ProdigiStorefrontBakeOrm,
        config: ValidationConfig,
    ) -> list[ValidationSample]:
        stmt = (
            select(ProdigiStorefrontOfferGroupOrm)
            .where(
                ProdigiStorefrontOfferGroupOrm.bake_id == bake.id,
                ProdigiStorefrontOfferGroupOrm.destination_country.in_(
                    [country.upper() for country in config.countries]
                ),
            )
            .options(selectinload(ProdigiStorefrontOfferGroupOrm.sizes))
            .order_by(
                ProdigiStorefrontOfferGroupOrm.destination_country,
                ProdigiStorefrontOfferGroupOrm.ratio_label,
                ProdigiStorefrontOfferGroupOrm.category_id,
            )
        )
        if config.ratios:
            stmt = stmt.where(ProdigiStorefrontOfferGroupOrm.ratio_label.in_(config.ratios))
        if config.categories:
            stmt = stmt.where(ProdigiStorefrontOfferGroupOrm.category_id.in_(config.categories))

        result = await self.db_session.execute(stmt)
        groups = list(result.scalars().all())

        samples: list[ValidationSample] = []
        for group in groups:
            sizes = [
                size
                for size in sorted(group.sizes, key=lambda item: (item.slot_size_label, item.id))
                if size.available
            ]
            if config.max_sizes_per_group > 0:
                sizes = sizes[: config.max_sizes_per_group]
            for size in sizes:
                samples.append(self._sample_from_size(group, size))
        return samples

    def _sample_from_size(
        self,
        group: ProdigiStorefrontOfferGroupOrm,
        size: ProdigiStorefrontOfferSizeOrm,
    ) -> ValidationSample:
        return ValidationSample(
            country=group.destination_country,
            ratio=group.ratio_label,
            category_id=group.category_id,
            group_id=int(group.id),
            size_id=int(size.id),
            slot_size_label=size.slot_size_label,
            size_label=size.size_label,
            sku=size.sku,
            attributes=self._build_attributes(group, size),
            shipping_method=size.shipping_method or size.default_shipping_tier,
            width_px=size.print_area_width_px,
            height_px=size.print_area_height_px,
            print_area_name=size.print_area_name or "default",
            print_area_source=size.print_area_source,
            supplier_size_inches=size.supplier_size_inches,
            supplier_size_cm=size.supplier_size_cm,
            product_price=self._float_or_none(size.product_price),
            shipping_price=self._float_or_none(size.shipping_price),
            total_cost=self._float_or_none(size.total_cost),
        )

    def _run_static_sample_checks(self, sample: ValidationSample) -> list[dict[str, Any]]:
        checks = [
            self._check(
                "sku_present",
                CHECK_PASSED if sample.sku else CHECK_FAILED,
                measured={"sku": sample.sku},
                expected={"sku": "non-empty"},
                sample=sample,
            ),
            self._check(
                "baked_pixels_present",
                CHECK_PASSED if sample.width_px and sample.height_px else CHECK_FAILED,
                measured={"width_px": sample.width_px, "height_px": sample.height_px},
                expected={"width_px": ">0", "height_px": ">0"},
                sample=sample,
            ),
            self._check(
                "baked_aspect_matches_ratio",
                CHECK_PASSED if self._aspect_matches_ratio(sample) else CHECK_FAILED,
                measured=self._aspect_measurement(sample),
                expected={"ratio_label": sample.ratio, "max_drift": 0.02},
                sample=sample,
            ),
            self._check(
                "shipping_method_present",
                CHECK_PASSED if sample.shipping_method else CHECK_FAILED,
                measured={"shipping_method": sample.shipping_method},
                expected={"shipping_method": "non-empty"},
                sample=sample,
            ),
            self._check(
                "cost_basis_present",
                CHECK_PASSED if sample.product_price is not None else CHECK_FAILED,
                measured={
                    "product_price": sample.product_price,
                    "shipping_price": sample.shipping_price,
                    "total_cost": sample.total_cost,
                },
                expected={"product_price": "present"},
                sample=sample,
            ),
        ]
        return checks

    async def _run_api_checks(
        self,
        samples: list[ValidationSample],
        *,
        include_quotes: bool,
    ) -> list[dict[str, Any]]:
        checks: list[dict[str, Any]] = []
        async with (
            ProdigiPrintAreaResolver() as resolver,
            ProdigiClient(sandbox=settings.PRODIGI_SANDBOX) as client,
        ):
            for sample in samples:
                checks.append(await self._check_live_pixels(resolver, sample))
                if include_quotes:
                    checks.append(await self._check_quote(client, sample))
        return checks

    async def _check_live_pixels(
        self,
        resolver: ProdigiPrintAreaResolver,
        sample: ValidationSample,
    ) -> dict[str, Any]:
        try:
            live = await resolver.resolve(
                sku=sample.sku,
                destination_country=sample.country,
                category_id=sample.category_id,
                attributes=sample.attributes,
                optional_attribute_keys=set(),
                supplier_size_inches=sample.supplier_size_inches,
                supplier_size_cm=sample.supplier_size_cm,
                slot_size_label=sample.slot_size_label,
                wrap_margin_pct=0.0,
            )
            live_width = live.get("print_area_width_px")
            live_height = live.get("print_area_height_px")
            matches = self._dimensions_match(
                sample.width_px, sample.height_px, live_width, live_height
            )
            return self._check(
                "live_prodigi_pixels_match",
                CHECK_PASSED if matches else CHECK_FAILED,
                measured={
                    "live_px": [live_width, live_height],
                    "print_area_name": live.get("print_area_name"),
                    "print_area_source": live.get("print_area_source"),
                },
                expected={"baked_px": [sample.width_px, sample.height_px], "tolerance_px": 2},
                sample=sample,
            )
        except Exception as exc:
            return self._check(
                "live_prodigi_pixels_match",
                CHECK_FAILED,
                measured=None,
                expected={"baked_px": [sample.width_px, sample.height_px]},
                sample=sample,
                error=str(exc),
            )

    async def _check_quote(self, client: ProdigiClient, sample: ValidationSample) -> dict[str, Any]:
        try:
            response = await client.get_quote(
                sample.sku or "",
                sample.country,
                "EUR",
                sample.attributes,
                sample.shipping_method or "Standard",
                sample.print_area_name or "default",
            )
            outcome = response.get("outcome")
            return self._check(
                "prodigi_quote_created",
                CHECK_PASSED if outcome in {"Created", "Ok", "OK"} else CHECK_FAILED,
                measured={"outcome": outcome, "quote_count": len(response.get("quotes") or [])},
                expected={"outcome": "Created"},
                sample=sample,
            )
        except Exception as exc:
            response = getattr(exc, "response", None)
            return self._check(
                "prodigi_quote_created",
                CHECK_FAILED,
                measured={"response_body": response.text if response is not None else None},
                expected={"outcome": "Created"},
                sample=sample,
                error=str(exc),
            )

    def _simulate_order_payloads(
        self,
        samples: list[ValidationSample],
        config: ValidationConfig,
    ) -> dict[str, Any]:
        if not samples:
            return {"requested": config.simulate_orders, "created": 0, "checks": []}

        sample_iter = cycle(samples)
        checks: list[dict[str, Any]] = []
        created = 0
        for order_index in range(1, config.simulate_orders + 1):
            batch_samples = list(islice(sample_iter, max(1, config.batch_size)))
            fake_order = self._fake_order(order_index, batch_samples[0].country)
            prepared_items = [
                SimpleNamespace(
                    item=self._fake_item(order_index, item_index, sample),
                    asset_url=f"https://example.com/static/validation/{order_index}/{item_index}.png",
                    rendered={"print_area_name": sample.print_area_name or "default"},
                )
                for item_index, sample in enumerate(batch_samples, start=1)
            ]
            try:
                payload = ProdigiOrderService.build_batch_order_payload(
                    order=fake_order,
                    prepared_items=prepared_items,
                    merchant_reference=f"artshop-validation-{order_index}",
                    idempotency_key=f"artshop-validation-{order_index}",
                    callback_url="https://example.com/api/v1/webhooks/prodigi",
                )
                created += 1
                checks.append(self._validate_payload_shape(payload, batch_samples, order_index))
            except Exception as exc:
                checks.append(
                    self._check(
                        "simulated_order_payload_shape",
                        CHECK_FAILED,
                        measured={"order_index": order_index},
                        expected={"items": len(batch_samples)},
                        error=str(exc),
                    )
                )
        return {"requested": config.simulate_orders, "created": created, "checks": checks}

    def _validate_payload_shape(
        self,
        payload: dict[str, Any],
        samples: list[ValidationSample],
        order_index: int,
    ) -> dict[str, Any]:
        required_top = {
            "shippingMethod",
            "merchantReference",
            "idempotencyKey",
            "recipient",
            "items",
        }
        missing_top = sorted(required_top - set(payload))
        item_count_ok = len(payload.get("items") or []) == len(samples)
        bad_items = [
            index
            for index, item in enumerate(payload.get("items") or [], start=1)
            if not item.get("sku")
            or not item.get("assets")
            or not item["assets"][0].get("url")
            or not item["assets"][0].get("printArea")
        ]
        passed = not missing_top and item_count_ok and not bad_items
        return self._check(
            "simulated_order_payload_shape",
            CHECK_PASSED if passed else CHECK_FAILED,
            measured={
                "order_index": order_index,
                "item_count": len(payload.get("items") or []),
                "missing_top_fields": missing_top,
                "bad_item_indexes": bad_items,
            },
            expected={"item_count": len(samples), "required_top_fields": sorted(required_top)},
        )

    def _build_report(
        self,
        *,
        config: ValidationConfig,
        bake: ProdigiStorefrontBakeOrm,
        samples: list[ValidationSample],
        checks: list[dict[str, Any]],
        simulated_orders: dict[str, Any],
    ) -> dict[str, Any]:
        counts_by_status = Counter(check["status"] for check in checks)
        counts_by_gate: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
        for check in checks:
            counts_by_gate[check["gate"]][check["status"]] += 1

        failed = counts_by_status[CHECK_FAILED]
        considered = counts_by_status[CHECK_PASSED] + counts_by_status[CHECK_FAILED]
        pass_rate = counts_by_status[CHECK_PASSED] / considered if considered else 0.0
        threshold_failures = self._threshold_failures(
            config=config,
            sample_count=len(samples),
            simulated_order_count=simulated_orders["created"],
            failed=failed,
            pass_rate=pass_rate,
            checks=checks,
        )

        return {
            "status": "approved" if not threshold_failures else "failed",
            "approved": not threshold_failures,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "mode": "sandbox" if settings.PRODIGI_SANDBOX else "live",
            "bake": {
                "id": bake.id,
                "bake_key": bake.bake_key,
                "paper_material": bake.paper_material,
                "status": bake.status,
                "offer_group_count": bake.offer_group_count,
                "offer_size_count": bake.offer_size_count,
            },
            "selection": {
                "countries": [country.upper() for country in config.countries],
                "ratios": config.ratios,
                "categories": config.categories,
                "max_sizes_per_group": config.max_sizes_per_group,
            },
            "thresholds": {
                "min_samples": config.thresholds.min_samples,
                "min_simulated_orders": config.thresholds.min_simulated_orders,
                "max_failures": config.thresholds.max_failures,
                "min_pass_rate": config.thresholds.min_pass_rate,
                "require_api_checks": config.thresholds.require_api_checks,
            },
            "summary": {
                "sample_count": len(samples),
                "simulated_orders_requested": simulated_orders["requested"],
                "simulated_orders_created": simulated_orders["created"],
                "check_count": len(checks),
                "passed": counts_by_status[CHECK_PASSED],
                "failed": failed,
                "skipped": counts_by_status[CHECK_SKIPPED],
                "pass_rate": round(pass_rate, 6),
                "by_gate": {
                    gate: dict(status_counts)
                    for gate, status_counts in sorted(counts_by_gate.items())
                },
            },
            "threshold_failures": threshold_failures,
            "failed_checks": [check for check in checks if check["status"] == CHECK_FAILED][:100],
        }

    def _threshold_failures(
        self,
        *,
        config: ValidationConfig,
        sample_count: int,
        simulated_order_count: int,
        failed: int,
        pass_rate: float,
        checks: list[dict[str, Any]],
    ) -> list[str]:
        failures = []
        if sample_count < config.thresholds.min_samples:
            failures.append(
                f"sample_count {sample_count} is below min_samples {config.thresholds.min_samples}"
            )
        if simulated_order_count < config.thresholds.min_simulated_orders:
            failures.append(
                "simulated_order_count "
                f"{simulated_order_count} is below min_simulated_orders "
                f"{config.thresholds.min_simulated_orders}"
            )
        if failed > config.thresholds.max_failures:
            failures.append(
                f"failed checks {failed} exceeds max_failures {config.thresholds.max_failures}"
            )
        if pass_rate < config.thresholds.min_pass_rate:
            failures.append(
                f"pass_rate {pass_rate:.6f} is below min_pass_rate {config.thresholds.min_pass_rate:.6f}"
            )
        if config.thresholds.require_api_checks and not any(
            check["gate"] == "live_prodigi_pixels_match" and check["status"] == CHECK_PASSED
            for check in checks
        ):
            failures.append("API pixel checks were required but no passing live check was recorded")
        return failures

    def _build_empty_report(self, config: ValidationConfig, reason: str) -> dict[str, Any]:
        return {
            "status": "failed",
            "approved": False,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "reason": reason,
            "threshold_failures": [reason],
            "selection": {"countries": config.countries},
        }

    def _check(
        self,
        gate: str,
        status: str,
        *,
        measured: dict[str, Any] | None,
        expected: dict[str, Any] | None,
        sample: ValidationSample | None = None,
        error: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "gate": gate,
            "status": status,
            "measured": measured,
            "expected": expected,
            "error": error,
        }
        if sample is not None:
            payload["sample"] = {
                "country": sample.country,
                "ratio": sample.ratio,
                "category_id": sample.category_id,
                "group_id": sample.group_id,
                "size_id": sample.size_id,
                "slot_size_label": sample.slot_size_label,
                "sku": sample.sku,
            }
        return payload

    def _build_attributes(
        self,
        group: ProdigiStorefrontOfferGroupOrm,
        size: ProdigiStorefrontOfferSizeOrm,
    ) -> dict[str, Any]:
        attributes: dict[str, Any] = {}
        dimensions = (
            size.print_area_dimensions if isinstance(size.print_area_dimensions, dict) else {}
        )
        variant_attributes = dimensions.get("variant_attributes")
        if isinstance(variant_attributes, dict):
            attributes.update(variant_attributes)
        attributes.update(group.fixed_attributes or {})
        attributes.update(group.recommended_defaults or {})
        if isinstance(group.allowed_attributes, dict):
            for key, values in group.allowed_attributes.items():
                if key not in attributes and isinstance(values, list) and values:
                    attributes[key] = values[0]
        return normalize_prodigi_attributes(attributes)

    def _aspect_matches_ratio(self, sample: ValidationSample) -> bool:
        measurement = self._aspect_measurement(sample)
        drift = measurement.get("drift")
        return drift is not None and drift <= 0.02

    def _aspect_measurement(self, sample: ValidationSample) -> dict[str, Any]:
        expected = self._ratio_value(sample.ratio)
        measured = None
        drift = None
        if sample.width_px and sample.height_px:
            width = min(sample.width_px, sample.height_px)
            height = max(sample.width_px, sample.height_px)
            measured = width / height if height else None
        if measured is not None and expected is not None:
            drift = abs(measured - expected)
        return {
            "ratio_label": sample.ratio,
            "measured_ratio": round(measured, 6) if measured is not None else None,
            "expected_ratio": round(expected, 6) if expected is not None else None,
            "drift": round(drift, 6) if drift is not None else None,
            "pixels": [sample.width_px, sample.height_px],
        }

    def _ratio_value(self, ratio: str | None) -> float | None:
        if not ratio or ":" not in ratio:
            return None
        left, right = ratio.split(":", 1)
        try:
            a = float(left)
            b = float(right)
        except ValueError:
            return None
        low, high = sorted((a, b))
        return low / high if high else None

    def _dimensions_match(
        self, baked_width: Any, baked_height: Any, live_width: Any, live_height: Any
    ) -> bool:
        try:
            return (
                abs(int(baked_width) - int(live_width)) <= 2
                and abs(int(baked_height) - int(live_height)) <= 2
            )
        except (TypeError, ValueError):
            return False

    def _fake_order(self, order_index: int, country: str) -> SimpleNamespace:
        return SimpleNamespace(
            id=order_index,
            first_name="Validation",
            last_name="Buyer",
            email=f"validation-{order_index}@example.com",
            phone="+15555550100",
            shipping_phone="+15555550100",
            shipping_address_line1="123 Validation Street",
            shipping_address_line2="",
            shipping_postal_code="10115",
            shipping_country_code=country,
            shipping_city="Berlin",
            shipping_state="",
        )

    def _fake_item(
        self,
        order_index: int,
        item_index: int,
        sample: ValidationSample,
    ) -> SimpleNamespace:
        return SimpleNamespace(
            id=(order_index * 1000) + item_index,
            prodigi_sku=sample.sku,
            prodigi_attributes=sample.attributes,
            prodigi_shipping_method=sample.shipping_method or "Standard",
        )

    def _write_report(self, report: dict[str, Any], output_path: str) -> None:
        path = Path(output_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(report, indent=2, ensure_ascii=False, default=str), encoding="utf-8"
        )

    def _float_or_none(self, value: Any) -> float | None:
        return float(value) if value is not None else None
