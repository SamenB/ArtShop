from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from PIL import Image

from src.config import settings
from src.integrations.prodigi.connectors.client import ProdigiClient
from src.integrations.prodigi.fulfillment.asset_download import verify_public_asset_download
from src.integrations.prodigi.fulfillment.assets import (
    AssetPublicationError,
    ProdigiFulfillmentAssetPublisher,
)
from src.integrations.prodigi.fulfillment.contract import (
    canonical_shipping_method,
    file_md5,
)
from src.integrations.prodigi.fulfillment.gates import FAILED, PASSED, SKIPPED
from src.integrations.prodigi.services.prodigi_order_assets import ProdigiOrderAssetService
from src.models.prodigi_fulfillment import (
    ProdigiFulfillmentEventOrm,
    ProdigiFulfillmentGateResultOrm,
)


@dataclass(slots=True)
class FulfillmentGateResult:
    gate: str
    status: str
    measured: dict[str, Any] | None = None
    expected: dict[str, Any] | None = None
    error: str | None = None


@dataclass(slots=True)
class PreparedProdigiItem:
    item: Any
    category_id: str
    asset_url: str
    rendered: dict[str, Any]
    target: dict[str, Any]
    gates: list[FulfillmentGateResult] = field(default_factory=list)

    @property
    def passed(self) -> bool:
        return all(gate.status in {PASSED, SKIPPED} for gate in self.gates)


class ProdigiFulfillmentQualityService:
    """
    Runs measurable, persisted gates before an order is allowed to reach Prodigi.

    These gates are deliberately concrete: each one records the expected value,
    measured value, and pass/fail status so the admin/team can audit exactly why
    a fulfillment attempt was allowed or blocked.
    """

    def __init__(self, db_session):
        self.db_session = db_session
        self.asset_service = ProdigiOrderAssetService(db_session)
        self.asset_publisher = ProdigiFulfillmentAssetPublisher()

    async def prepare_item(
        self,
        *,
        order: Any,
        item: Any,
        job_id: int | None = None,
    ) -> PreparedProdigiItem | None:
        gates: list[FulfillmentGateResult] = []

        category_id = self._resolve_category_id(item)
        gates.append(
            FulfillmentGateResult(
                gate="category_resolved",
                status=PASSED if category_id else FAILED,
                measured={"category_id": category_id},
                expected={"required": True},
                error=None if category_id else "Missing or unresolvable Prodigi category id.",
            )
        )
        if not category_id:
            await self.persist_gates(order=order, item=item, gates=gates, job_id=job_id)
            return None

        master_asset = await self.asset_service.resolve_master_asset(
            artwork_id=item.artwork_id,
            category_id=category_id,
        )
        gates.append(
            FulfillmentGateResult(
                gate="master_asset_available",
                status=PASSED if master_asset is not None else FAILED,
                measured={
                    "artwork_id": item.artwork_id,
                    "asset_id": getattr(master_asset, "id", None),
                    "asset_role": getattr(master_asset, "asset_role", None),
                    "file_url": getattr(master_asset, "file_url", None),
                },
                expected={"provider_key": "prodigi", "role": "master"},
                error=None if master_asset is not None else "No master print asset was found.",
            )
        )
        if master_asset is None:
            await self.persist_gates(order=order, item=item, gates=gates, job_id=job_id)
            return None

        target = await self.asset_service.resolve_target_size(
            category_id=category_id,
            slot_size_label=getattr(item, "prodigi_slot_size_label", None) or item.size,
            sku=item.prodigi_sku,
            country_code=order.shipping_country_code,
        )
        gates.append(
            FulfillmentGateResult(
                gate="baked_target_pixels_resolved",
                status=PASSED if self._target_has_pixels(target) else FAILED,
                measured=self._target_measurement(target),
                expected={
                    "source": "active_prodigi_storefront_bake",
                    "width_px": ">0",
                    "height_px": ">0",
                },
                error=None
                if self._target_has_pixels(target)
                else "No pixel target in active bake.",
            )
        )
        if not self._target_has_pixels(target):
            await self.persist_gates(order=order, item=item, gates=gates, job_id=job_id)
            return None
        self._sync_item_from_target(item=item, target=target)
        gates.append(
            FulfillmentGateResult(
                gate="storefront_rehydrated",
                status=PASSED if self._storefront_target_is_complete(item, target) else FAILED,
                measured={
                    "item_id": getattr(item, "id", None),
                    "active_bake_id": target.get("storefront_bake_id"),
                    "item_bake_id": getattr(item, "prodigi_storefront_bake_id", None),
                    "country": order.shipping_country_code,
                    "sku": getattr(item, "prodigi_sku", None),
                    "category_id": category_id,
                    "slot_size_label": getattr(item, "prodigi_slot_size_label", None),
                    "attributes": getattr(item, "prodigi_attributes", None) or {},
                    "shipping_method": getattr(item, "prodigi_shipping_method", None),
                    "supplier_total": getattr(item, "prodigi_supplier_total_eur", None),
                },
                expected={
                    "source": "active_prodigi_storefront_bake",
                    "sku": "present",
                    "category_id": "present",
                    "slot_size_label": "present",
                    "shipping_method": "present",
                    "supplier_cost_basis": "present",
                },
                error=None
                if self._storefront_target_is_complete(item, target)
                else "Stored order item could not be rehydrated from the active Prodigi bake.",
            )
        )
        if not self._storefront_target_is_complete(item, target):
            await self.persist_gates(order=order, item=item, gates=gates, job_id=job_id)
            return None

        verified_target = await self.asset_service.verify_target_size_with_prodigi_api(
            target=target,
            category_id=category_id,
            sku=item.prodigi_sku,
            country_code=order.shipping_country_code,
            attributes=item.prodigi_attributes or {},
        )
        api_key_present = bool(settings.PRODIGI_API_KEY)
        live_required = not settings.PRODIGI_SANDBOX
        pixel_status = PASSED if verified_target is not None and api_key_present else SKIPPED
        if verified_target is None or (live_required and not api_key_present):
            pixel_status = FAILED
        gates.append(
            FulfillmentGateResult(
                gate="live_prodigi_pixel_contract_verified",
                status=pixel_status,
                measured=self._target_measurement(verified_target),
                expected={
                    "live_api_key_present": api_key_present,
                    "api_key_required": live_required,
                    "allowed_drift_px": 2,
                    "required_in_prod": True,
                },
                error=None
                if pixel_status in {PASSED, SKIPPED}
                else "Live Prodigi product-details pixels did not match the baked target.",
            )
        )
        if verified_target is None or (live_required and not api_key_present):
            await self.persist_gates(order=order, item=item, gates=gates, job_id=job_id)
            return None
        self._sync_item_from_target(item=item, target=verified_target)

        aspect_check = self._aspect_compatible(
            int(verified_target["width_px"]),
            int(verified_target["height_px"]),
            int(target["width_px"]),
            int(target["height_px"]),
        )
        gates.append(
            FulfillmentGateResult(
                gate="live_prodigi_aspect_compatible",
                status=PASSED if aspect_check["compatible"] else FAILED,
                measured=aspect_check["measured"],
                expected=aspect_check["expected"],
                error=None
                if aspect_check["compatible"]
                else "Live Prodigi pixel aspect ratio is incompatible with the baked target.",
            )
        )
        if not aspect_check["compatible"]:
            await self.persist_gates(order=order, item=item, gates=gates, job_id=job_id)
            return None

        quote_gate = await self._quote_gate(
            order=order,
            item=item,
            print_area_name=verified_target.get("print_area_name") or "default",
        )
        gates.append(quote_gate)
        if quote_gate.status == FAILED:
            await self.persist_gates(order=order, item=item, gates=gates, job_id=job_id)
            return None

        try:
            rendered = self.asset_service.render_from_master(
                master_asset=master_asset,
                category_id=category_id,
                slot_size_label=getattr(item, "prodigi_slot_size_label", None) or item.size,
                target_width=int(verified_target["width_px"]),
                target_height=int(verified_target["height_px"]),
                output_dir=Path("static") / "print-orders" / str(order.id) / str(item.id),
                white_border_pct=await self.asset_service._get_artwork_border_pct(item.artwork_id),
            )
        except Exception as exc:
            gates.append(
                FulfillmentGateResult(
                    gate="asset_rendered",
                    status=FAILED,
                    measured={"error": str(exc)},
                    expected={"format": "PNG", "source": "master_asset"},
                    error=f"Rendered asset failed: {exc}",
                )
            )
            await self.persist_gates(order=order, item=item, gates=gates, job_id=job_id)
            return None
        gates.append(
            FulfillmentGateResult(
                gate="asset_rendered",
                status=PASSED if rendered.get("file_path") else FAILED,
                measured={
                    "file_path": rendered.get("file_path"),
                    "file_url": rendered.get("file_url"),
                    "derivative_kind": rendered.get("derivative_kind"),
                },
                expected={"format": "PNG", "source": "master_asset"},
                error=None
                if rendered.get("file_path")
                else "Rendered asset did not produce a file.",
            )
        )

        actual_px = self._read_image_size(rendered.get("file_path"))
        expected_px = [rendered.get("width_px"), rendered.get("height_px")]
        gates.append(
            FulfillmentGateResult(
                gate="rendered_asset_pixel_match",
                status=PASSED if actual_px == expected_px else FAILED,
                measured={"actual_px": actual_px},
                expected={"expected_px": expected_px},
                error=None
                if actual_px == expected_px
                else "Rendered file pixels do not match target.",
            )
        )

        md5_hash = file_md5(rendered.get("file_path"))
        if md5_hash:
            rendered["md5_hash"] = md5_hash
        gates.append(
            FulfillmentGateResult(
                gate="rendered_asset_md5_ready",
                status=PASSED if md5_hash else FAILED,
                measured={"md5_hash": md5_hash},
                expected={"asset_md5_hash": "present"},
                error=None if md5_hash else "Rendered file hash could not be calculated.",
            )
        )

        try:
            published = await self.asset_publisher.publish_rendered_asset(
                order_id=int(order.id),
                order_item_id=int(item.id),
                rendered=rendered,
                md5_hash=md5_hash,
            )
        except AssetPublicationError as exc:
            gates.append(
                FulfillmentGateResult(
                    gate="public_asset_url_ready",
                    status=FAILED,
                    measured={
                        "storage_backend": self.asset_publisher.backend,
                        "file_path": rendered.get("file_path"),
                        "error": str(exc),
                    },
                    expected={
                        "storage_backend": "s3_compatible or public local static host",
                        "downloadable_url": True,
                        "external_https": True,
                    },
                    error=str(exc),
                )
            )
            await self.persist_gates(order=order, item=item, gates=gates, job_id=job_id)
            return None

        asset_url = published.public_url
        if asset_url:
            rendered["public_asset_url"] = asset_url
        rendered["asset_storage_backend"] = published.backend
        if published.storage_key:
            rendered["asset_storage_key"] = published.storage_key
        if published.bucket:
            rendered["asset_storage_bucket"] = published.bucket
        external_https = self._is_external_https(asset_url)
        public_url_error = self._public_asset_url_error(asset_url, external_https)
        gates.append(
            FulfillmentGateResult(
                gate="public_asset_url_ready",
                status=PASSED if external_https else FAILED,
                measured={
                    "asset_url": asset_url,
                    "storage_backend": published.backend,
                    "storage_key": published.storage_key,
                    "bucket": published.bucket,
                    "public_base_url": settings.PUBLIC_BASE_URL,
                    "print_asset_public_base_url": settings.PRINT_ASSET_PUBLIC_BASE_URL,
                    "external_https": external_https,
                },
                expected={"downloadable_url": True, "external_https": True},
                error=public_url_error,
            )
        )
        if not asset_url or not external_https:
            await self.persist_gates(order=order, item=item, gates=gates, job_id=job_id)
            return None

        download_check = await verify_public_asset_download(asset_url, expected_md5=md5_hash)
        gates.append(
            FulfillmentGateResult(
                gate="public_asset_download_verified",
                status=PASSED if download_check["passed"] else FAILED,
                measured=download_check["measured"],
                expected={
                    "http_status": "2xx",
                    "downloaded_bytes": ">0",
                    "md5_hash": md5_hash,
                },
                error=download_check["error"],
            )
        )
        if not download_check["passed"]:
            await self.persist_gates(order=order, item=item, gates=gates, job_id=job_id)
            return None

        prepared = PreparedProdigiItem(
            item=item,
            category_id=category_id,
            asset_url=asset_url,
            rendered=rendered,
            target=verified_target,
            gates=gates,
        )
        await self.persist_gates(order=order, item=item, gates=gates, job_id=job_id)
        return prepared if prepared.passed else None

    async def persist_gates(
        self,
        *,
        order: Any,
        item: Any | None,
        gates: list[FulfillmentGateResult],
        job_id: int | None,
    ) -> None:
        if not hasattr(self.db_session, "add"):
            return
        for gate in gates:
            self.db_session.add(
                ProdigiFulfillmentGateResultOrm(
                    job_id=job_id,
                    order_id=int(order.id),
                    order_item_id=int(item.id)
                    if item is not None and getattr(item, "id", None) is not None
                    else None,
                    gate=gate.gate,
                    status=gate.status,
                    measured=self._json_safe(gate.measured),
                    expected=self._json_safe(gate.expected),
                    error=gate.error,
                )
            )

    async def persist_order_gate(
        self,
        *,
        order: Any,
        job_id: int | None,
        gate: FulfillmentGateResult,
    ) -> None:
        await self.persist_gates(order=order, item=None, gates=[gate], job_id=job_id)

    def build_gate_summary(self, prepared_items: list[PreparedProdigiItem]) -> dict[str, Any]:
        gate_counts: dict[str, dict[str, int]] = {}
        for prepared in prepared_items:
            for gate in prepared.gates:
                gate_counts.setdefault(gate.gate, {})
                gate_counts[gate.gate][gate.status] = gate_counts[gate.gate].get(gate.status, 0) + 1
        return {
            "item_count": len(prepared_items),
            "gates": gate_counts,
        }

    def add_event(
        self,
        *,
        event_type: str,
        stage: str,
        status: str,
        order: Any | None = None,
        item: Any | None = None,
        job_id: int | None = None,
        external_id: str | None = None,
        request_payload: dict[str, Any] | None = None,
        response_payload: dict[str, Any] | None = None,
        metadata: dict[str, Any] | None = None,
        error: str | None = None,
    ) -> None:
        if not hasattr(self.db_session, "add"):
            return
        self.db_session.add(
            ProdigiFulfillmentEventOrm(
                job_id=job_id,
                order_id=int(order.id) if getattr(order, "id", None) is not None else None,
                order_item_id=int(item.id) if getattr(item, "id", None) is not None else None,
                user_id=int(order.user_id) if getattr(order, "user_id", None) is not None else None,
                event_type=event_type,
                stage=stage,
                status=status,
                external_id=external_id,
                request_payload=self._json_safe(request_payload),
                response_payload=self._json_safe(response_payload),
                metadata_json=self._json_safe(metadata),
                error=error,
            )
        )

    def _resolve_category_id(self, item: Any) -> str | None:
        from src.integrations.prodigi.services.prodigi_orders import ProdigiOrderService

        return ProdigiOrderService._resolve_category_id(item)

    def _target_has_pixels(self, target: dict[str, Any] | None) -> bool:
        return bool(target and target.get("width_px") and target.get("height_px"))

    def _target_measurement(self, target: dict[str, Any] | None) -> dict[str, Any] | None:
        if target is None:
            return None
        return {
            "width_px": target.get("width_px"),
            "height_px": target.get("height_px"),
            "print_area_name": target.get("print_area_name"),
            "print_area_source": target.get("print_area_source"),
            "prodigi_verified": target.get("prodigi_verified"),
            "sku": target.get("sku"),
            "slot_size_label": target.get("slot_size_label"),
        }

    def _sync_item_from_target(self, *, item: Any, target: dict[str, Any]) -> None:
        target_sku = target.get("sku")
        if target_sku and getattr(item, "prodigi_sku", None) != target_sku:
            item.prodigi_sku = target_sku
        target_slot = target.get("slot_size_label")
        if target_slot and getattr(item, "prodigi_slot_size_label", None) != target_slot:
            item.prodigi_slot_size_label = target_slot
        if target.get("product_price") is not None:
            item.prodigi_wholesale_eur = target.get("product_price")
        if target.get("shipping_price") is not None:
            item.prodigi_shipping_eur = target.get("shipping_price")

    def _storefront_target_is_complete(self, item: Any, target: dict[str, Any]) -> bool:
        supplier_total = getattr(item, "prodigi_supplier_total_eur", None)
        if supplier_total is None:
            supplier_total = (getattr(item, "prodigi_wholesale_eur", None) or 0) + (
                getattr(item, "prodigi_shipping_eur", None) or 0
            )
        return bool(
            target.get("storefront_bake_id")
            and getattr(item, "prodigi_sku", None)
            and getattr(item, "prodigi_slot_size_label", None)
            and getattr(item, "prodigi_shipping_method", None)
            and supplier_total is not None
        )

    async def _quote_gate(
        self,
        *,
        order: Any,
        item: Any,
        print_area_name: str,
    ) -> FulfillmentGateResult:
        api_key_present = bool(settings.PRODIGI_API_KEY)
        api_key_required = not settings.PRODIGI_SANDBOX
        request = {
            "sku": getattr(item, "prodigi_sku", None),
            "destination_country": order.shipping_country_code,
            "currency": getattr(item, "prodigi_supplier_currency", None) or "EUR",
            "attributes": getattr(item, "prodigi_attributes", None) or {},
            "shipping_method": canonical_shipping_method(
                getattr(item, "prodigi_shipping_method", None)
            ),
            "print_area": print_area_name or "default",
        }
        if not api_key_present:
            return FulfillmentGateResult(
                gate="prodigi_quote_check",
                status=FAILED if api_key_required else SKIPPED,
                measured={"api_key_present": False, "request": request},
                expected={"quote_outcome": "Created|Ok", "api_key_required": api_key_required},
                error="PRODIGI_API_KEY is required for live Prodigi quote validation."
                if api_key_required
                else None,
            )
        try:
            async with ProdigiClient(sandbox=settings.PRODIGI_SANDBOX) as client:
                response = await client.get_quote(**request)
        except Exception as exc:
            return FulfillmentGateResult(
                gate="prodigi_quote_check",
                status=FAILED,
                measured={"request": request, "error": str(exc)},
                expected={"quote_outcome": "Created|Ok"},
                error=f"Prodigi quote check failed: {exc}",
            )
        outcome = str(response.get("outcome") or "").replace(" ", "").lower()
        quotes = response.get("quotes") if isinstance(response.get("quotes"), list) else []
        passed = outcome in {"created", "ok"} and bool(quotes)
        return FulfillmentGateResult(
            gate="prodigi_quote_check",
            status=PASSED if passed else FAILED,
            measured={"request": request, "response": response},
            expected={"quote_outcome": "Created|Ok", "quotes": "non-empty"},
            error=None if passed else "Prodigi quote response did not include an accepted quote.",
        )

    def _read_image_size(self, file_path: str | None) -> list[int] | None:
        if not file_path:
            return None
        with Image.open(file_path) as output:
            return [int(output.width), int(output.height)]

    def _aspect_compatible(
        self,
        live_width: int,
        live_height: int,
        baked_width: int,
        baked_height: int,
    ) -> dict[str, Any]:
        live_ratio = live_width / live_height if live_height else 0
        baked_ratio = baked_width / baked_height if baked_height else 0
        drift = abs(live_ratio - baked_ratio)
        tolerance = 0.01
        return {
            "compatible": drift <= tolerance,
            "measured": {
                "live_px": [live_width, live_height],
                "live_ratio": round(live_ratio, 6),
                "baked_ratio": round(baked_ratio, 6),
                "drift": round(drift, 6),
            },
            "expected": {
                "baked_px": [baked_width, baked_height],
                "max_ratio_drift": tolerance,
            },
        }

    def _is_external_https(self, url: str | None) -> bool:
        if not url:
            return False
        normalized = url.lower()
        return (
            normalized.startswith("https://")
            and "localhost" not in normalized
            and "127.0.0.1" not in normalized
        )

    def _public_asset_url_error(
        self,
        asset_url: str | None,
        external_https: bool,
    ) -> str | None:
        if not asset_url:
            return "Prodigi requires a public HTTPS asset URL before order creation."
        if not external_https:
            return (
                "Prodigi requires a public HTTPS asset URL before order creation. "
                "Configure PRINT_ASSET_STORAGE_BACKEND=s3_compatible with a public "
                "PRINT_ASSET_PUBLIC_BASE_URL, or use a production HTTPS static host."
            )
        return None

    def _json_safe(self, payload: Any) -> Any:
        if payload is None:
            return None
        return json.loads(json.dumps(payload, default=str))


def stable_payload_hash(payload: dict[str, Any]) -> str:
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str).encode()
    return hashlib.sha256(encoded).hexdigest()
