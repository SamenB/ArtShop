from __future__ import annotations

import hashlib
import json
from typing import Any

from src.init import redis_manager
from src.repositories.prodigi_storefront import ProdigiStorefrontRepository
from src.services.artwork_print_profiles import (
    ArtworkPrintProfileService,
    resolve_profile_attribute_config,
)
from src.services.artworks import ArtworkService
from src.services.prodigi_artwork_collection_storefront import (
    ProdigiArtworkCollectionStorefrontService,
)
from src.services.prodigi_storefront_snapshot import ProdigiStorefrontSnapshotService

CATEGORY_MEDIUM_MAP = {
    "paperPrintRolled": "paper",
    "paperPrintBoxFramed": "paper",
    "paperPrintBoxFramedMounted": "paper",
    "paperPrintClassicFramed": "paper",
    "paperPrintClassicFramedMounted": "paper",
    "canvasRolled": "canvas",
    "canvasStretched": "canvas",
    "canvasClassicFrame": "canvas",
    "canvasFloatingFrame": "canvas",
}


class ProdigiArtworkStorefrontService:
    """
    Public-facing storefront read model for one artwork in one destination country.

    This service intentionally sits on top of the baked snapshot layer instead of
    querying the raw Prodigi catalog. That keeps the website aligned with the
    exact snapshot that the admin approved.
    """

    def __init__(self, db):
        self.db = db
        self.artwork_service = ArtworkService(db)
        self.print_profile_service = ArtworkPrintProfileService(db)
        self.storefront_repository = ProdigiStorefrontRepository(db.session)
        self.snapshot_service = ProdigiStorefrontSnapshotService(db)
        self.cache_ttl_seconds = 900

    async def get_artwork_storefront(
        self,
        artwork_id_or_slug: str,
        country_code: str,
    ) -> dict[str, Any]:
        requested_country = (country_code or "").upper()
        active_bake = await self.storefront_repository.get_active_bake()
        if active_bake is not None:
            materialized = await self.storefront_repository.get_materialized_payload_for_ref(
                bake_id=active_bake.id,
                artwork_id_or_slug=artwork_id_or_slug,
                country_code=requested_country,
            )
            if materialized is not None and materialized.payload:
                return dict(materialized.payload)

        artwork = await self._get_artwork(artwork_id_or_slug)
        profile_bundle = await self.print_profile_service.get_profile_bundle(artwork.id)

        ratio_label = (profile_bundle.get("print_aspect_ratio") or {}).get("label")
        medium_availability = self._build_medium_availability(artwork)
        payload_signature = self._build_payload_signature(
            artwork=artwork,
            requested_country=requested_country,
            profile_bundle=profile_bundle,
            medium_availability=medium_availability,
        )
        cache_key = f"prodigi:artwork-storefront:v1:{artwork.id}:{requested_country}:{payload_signature}"
        cached_payload = await self._get_cached_payload(cache_key)
        if cached_payload is not None:
            return cached_payload

        base_payload = self._build_base_payload(
            artwork=artwork,
            requested_country=requested_country,
            profile_bundle=profile_bundle,
            medium_availability=medium_availability,
        )

        if ratio_label is None:
            base_payload["message"] = (
                "Artwork has no assigned print aspect ratio, so storefront print offers "
                "cannot be resolved yet."
            )
            await self._set_cached_payload(cache_key, base_payload)
            return base_payload

        snapshot = await self.snapshot_service.get_country_storefront(
            selected_ratio=ratio_label,
            country_code=requested_country,
        )
        if not snapshot.get("has_active_bake"):
            base_payload["message"] = (
                snapshot.get("message") or "No active storefront snapshot exists."
            )
            await self._set_cached_payload(cache_key, base_payload)
            return base_payload

        base_payload = self.build_payload_from_snapshot(
            artwork=artwork,
            requested_country=requested_country,
            profile_bundle=profile_bundle,
            snapshot=snapshot,
            medium_availability=medium_availability,
        )
        await self._set_cached_payload(cache_key, base_payload)
        return base_payload

    def build_payload_from_snapshot(
        self,
        *,
        artwork: Any,
        requested_country: str,
        profile_bundle: dict[str, Any],
        snapshot: dict[str, Any] | None,
        medium_availability: dict[str, dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        medium_availability = medium_availability or self._build_medium_availability(artwork)
        base_payload = self._build_base_payload(
            artwork=artwork,
            requested_country=requested_country,
            profile_bundle=profile_bundle,
            medium_availability=medium_availability,
        )
        if not snapshot:
            base_payload["message"] = "No active storefront snapshot exists."
            return base_payload

        base_payload["available_country_codes"] = snapshot.get("available_country_codes") or []
        if not snapshot.get("category_cells"):
            base_payload["country_name"] = snapshot.get("country_name")
            base_payload["entry_promo"] = snapshot.get("entry_promo")
            base_payload["message"] = snapshot.get("message")
            return base_payload

        base_payload["country_name"] = snapshot.get("country_name")
        categories_by_id = {
            item["category_id"]: item for item in snapshot.get("categories", [])
        }
        effective_profiles = profile_bundle.get("effective_profiles") or {}

        for cell in snapshot.get("category_cells", []):
            category_id = cell["category_id"]
            category_meta = categories_by_id.get(category_id)
            if category_meta is None:
                continue

            card = self._build_category_card(
                category_meta=category_meta,
                cell=cell,
                effective_profile=effective_profiles.get(category_id),
                medium_availability=medium_availability,
            )
            if card is None:
                continue
            base_payload["mediums"][card["medium"]]["cards"].append(card)

        base_payload["entry_promo"] = snapshot.get("entry_promo")
        base_payload["country_supported"] = any(
            medium["cards"] for medium in base_payload["mediums"].values()
        )
        if base_payload["country_supported"]:
            base_payload["message"] = "Storefront offers resolved from the active baked snapshot."
        else:
            base_payload["message"] = (
                f"{requested_country} exists in the baked snapshot, but this artwork does not "
                "currently expose purchasable print cards there."
            )
        return base_payload

    def build_collection_summary(
        self,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        return ProdigiArtworkCollectionStorefrontService.build_summary_from_storefront_payload(
            payload
        )

    async def _get_artwork(self, artwork_id_or_slug: str):
        if artwork_id_or_slug.isdigit():
            return await self.artwork_service.get_artwork_by_id(int(artwork_id_or_slug))
        return await self.artwork_service.get_artwork_by_slug(artwork_id_or_slug)

    def _build_medium_availability(self, artwork: Any) -> dict[str, dict[str, Any]]:
        return {
            "paper": {
                "open_available": bool(getattr(artwork, "has_paper_print", False)),
                "limited_available": bool(getattr(artwork, "has_paper_print_limited", False)),
                "limited_quantity": getattr(artwork, "paper_print_limited_quantity", None),
            },
            "canvas": {
                "open_available": bool(getattr(artwork, "has_canvas_print", False)),
                "limited_available": bool(getattr(artwork, "has_canvas_print_limited", False)),
                "limited_quantity": getattr(artwork, "canvas_print_limited_quantity", None),
            },
        }

    def _build_base_payload(
        self,
        *,
        artwork: Any,
        requested_country: str,
        profile_bundle: dict[str, Any],
        medium_availability: dict[str, dict[str, Any]],
    ) -> dict[str, Any]:
        return {
            "artwork_id": artwork.id,
            "slug": artwork.slug,
            "title": artwork.title,
            "country_code": requested_country,
            "country_name": None,
            "print_aspect_ratio": profile_bundle.get("print_aspect_ratio"),
            "active_bake": profile_bundle.get("active_bake"),
            "print_quality_url": profile_bundle.get("print_quality_url"),
            "print_source_metadata": profile_bundle.get("print_source_metadata") or {},
            "source_quality_summary": profile_bundle.get("source_quality_summary"),
            "mediums": {
                "paper": {
                    **medium_availability["paper"],
                    "cards": [],
                },
                "canvas": {
                    **medium_availability["canvas"],
                    "cards": [],
                },
            },
            "entry_promo": None,
            "available_country_codes": [],
            "country_supported": False,
            "message": None,
        }

    def _build_category_card(
        self,
        *,
        category_meta: dict[str, Any],
        cell: dict[str, Any],
        effective_profile: dict[str, Any] | None,
        medium_availability: dict[str, dict[str, Any]],
    ) -> dict[str, Any] | None:
        category_id = category_meta["category_id"]
        medium = CATEGORY_MEDIUM_MAP.get(category_id)
        if medium is None:
            return None

        medium_state = medium_availability[medium]
        if not (medium_state["open_available"] or medium_state["limited_available"]):
            return None

        size_options = []
        for size_entry in cell.get("size_entries", []):
            if not size_entry.get("available"):
                continue

            business_policy = size_entry.get("business_policy") or {}
            shipping_mode = business_policy.get("shipping_mode")
            if shipping_mode == "hide":
                continue

            retail_product_price = business_policy.get("retail_product_price")
            customer_shipping_price = business_policy.get("customer_shipping_price")
            customer_total_price = self._build_customer_total_price(
                retail_product_price=retail_product_price,
                customer_shipping_price=customer_shipping_price,
                shipping_mode=shipping_mode,
            )

            size_options.append(
                {
                    "slot_size_label": size_entry["slot_size_label"],
                    "size_label": size_entry["size_label"],
                    "sku": size_entry.get("sku"),
                    "supplier_size_cm": size_entry.get("supplier_size_cm"),
                    "supplier_size_inches": size_entry.get("supplier_size_inches"),
                    "print_area": size_entry.get("print_area"),
                    "provider_attributes": size_entry.get("provider_attributes") or {},
                    "source_country": size_entry.get("source_country"),
                    "currency": size_entry.get("currency"),
                    "delivery_days": size_entry.get("delivery_days"),
                    "shipping_method": size_entry.get("shipping_method"),
                    "service_name": size_entry.get("service_name"),
                    "service_level": size_entry.get("service_level"),
                    "default_shipping_tier": size_entry.get("default_shipping_tier"),
                    "shipping_profiles": size_entry.get("shipping_profiles") or [],
                    "shipping_support": size_entry.get("shipping_support"),
                    "business_policy": business_policy,
                    "supplier_product_price": size_entry.get("product_price"),
                    "supplier_shipping_price": size_entry.get("shipping_price"),
                    "supplier_total_cost": size_entry.get("total_cost"),
                    "retail_product_price": retail_product_price,
                    "customer_shipping_price": customer_shipping_price,
                    "customer_total_price": customer_total_price,
                }
            )

        if not size_options:
            return None

        resolved_fixed, resolved_defaults, resolved_allowed = resolve_profile_attribute_config(
            fixed_attributes=cell.get("fixed_attributes") or {},
            recommended_defaults=cell.get("recommended_defaults") or {},
            allowed_attributes=cell.get("allowed_attributes") or {},
            effective_profile=effective_profile,
        )
        default_attributes = self._build_default_attributes(
            fixed_attributes=resolved_fixed,
            recommended_defaults=resolved_defaults,
            allowed_attributes=resolved_allowed,
        )

        return {
            "category_id": category_id,
            "label": category_meta["label"],
            "medium": medium,
            "material_label": category_meta.get("material_label"),
            "frame_label": category_meta.get("frame_label"),
            "storefront_action": cell.get("storefront_action"),
            "fulfillment_level": cell.get("effective_fulfillment_level")
            or cell.get("fulfillment_level"),
            "geography_scope": cell.get("effective_geography_scope")
            or cell.get("geography_scope"),
            "tax_risk": cell.get("effective_tax_risk") or cell.get("tax_risk"),
            "source_mix": cell.get("source_mix"),
            "source_countries": cell.get("source_countries") or [],
            "note": cell.get("note"),
            "available_shipping_tiers": cell.get("available_shipping_tiers") or [],
            "default_shipping_tier": cell.get("default_shipping_tier"),
            "shipping_support": cell.get("shipping_support"),
            "business_summary": cell.get("business_summary"),
            "edition_context": {
                "open_available": medium_state["open_available"],
                "limited_available": medium_state["limited_available"],
                "limited_quantity": medium_state["limited_quantity"],
            },
            "default_prodigi_attributes": default_attributes,
            "allowed_attribute_options": resolved_allowed,
            "print_profile": effective_profile or {},
            "size_options": size_options,
        }

    def _build_customer_total_price(
        self,
        *,
        retail_product_price: float | None,
        customer_shipping_price: float | None,
        shipping_mode: str | None,
    ) -> float | None:
        if retail_product_price is None:
            return None
        if shipping_mode == "included":
            return retail_product_price
        if shipping_mode == "pass_through":
            return round(retail_product_price + float(customer_shipping_price or 0), 2)
        return None

    def _build_default_attributes(
        self,
        *,
        fixed_attributes: dict[str, Any],
        recommended_defaults: dict[str, Any],
        allowed_attributes: dict[str, list[Any]],
    ) -> dict[str, Any]:
        defaults: dict[str, Any] = {}
        for key, value in fixed_attributes.items():
            defaults[key] = value
        for key, value in recommended_defaults.items():
            defaults.setdefault(key, value)
        for key, values in allowed_attributes.items():
            if key not in defaults and values:
                defaults[key] = values[0]
        return defaults

    def _build_payload_signature(
        self,
        *,
        artwork: Any,
        requested_country: str,
        profile_bundle: dict[str, Any],
        medium_availability: dict[str, dict[str, Any]],
    ) -> str:
        source = {
            "artwork_id": artwork.id,
            "slug": getattr(artwork, "slug", None),
            "country_code": requested_country,
            "active_bake": profile_bundle.get("active_bake"),
            "print_aspect_ratio": profile_bundle.get("print_aspect_ratio"),
            "print_quality_url": profile_bundle.get("print_quality_url"),
            "print_source_metadata": profile_bundle.get("print_source_metadata"),
            "source_quality_summary": profile_bundle.get("source_quality_summary"),
            "effective_profiles": profile_bundle.get("effective_profiles"),
            "medium_availability": medium_availability,
        }
        digest = hashlib.sha256(
            json.dumps(source, sort_keys=True, default=str).encode("utf-8")
        ).hexdigest()
        return digest[:16]

    async def _get_cached_payload(self, key: str) -> dict[str, Any] | None:
        if redis_manager.redis is None:
            return None
        cached = await redis_manager.get(key)
        if not cached:
            return None
        try:
            return json.loads(cached)
        except json.JSONDecodeError:
            return None

    async def _set_cached_payload(self, key: str, payload: dict[str, Any]) -> None:
        if redis_manager.redis is None:
            return
        await redis_manager.set(key, json.dumps(payload), expire=self.cache_ttl_seconds)
