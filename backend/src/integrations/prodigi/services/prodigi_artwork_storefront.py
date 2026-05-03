from __future__ import annotations

from typing import Any

from src.integrations.prodigi.repositories.prodigi_storefront import ProdigiStorefrontRepository
from src.integrations.prodigi.services.prodigi_artwork_collection_storefront import (
    ProdigiArtworkCollectionStorefrontService,
)
from src.integrations.prodigi.services.prodigi_business_policy import ProdigiBusinessPolicyService
from src.integrations.prodigi.services.prodigi_market_priority import get_market_priority
from src.integrations.prodigi.services.prodigi_shipping_support_policy import (
    ProdigiShippingSupportPolicyService,
)
from src.integrations.prodigi.services.prodigi_storefront_read_model import (
    STOREFRONT_POLICY_VERSION,
    ProdigiStorefrontReadModelService,
)
from src.integrations.prodigi.services.prodigi_storefront_settings import (
    ProdigiStorefrontSettingsService,
)
from src.integrations.prodigi.services.prodigi_storefront_snapshot import (
    ProdigiStorefrontSnapshotService,
)
from src.services.artwork_print_profiles import (
    ArtworkPrintProfileService,
    resolve_profile_attribute_config,
)
from src.services.artworks import ArtworkService

CATEGORY_MEDIUM_MAP = {
    "paperPrintRolled": "paper",
    "paperPrintBoxFramed": "paper",
    "paperPrintClassicFramed": "paper",
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
        self.read_model = ProdigiStorefrontReadModelService(db)
        self.snapshot_service = ProdigiStorefrontSnapshotService(db)
        self.business_policy = ProdigiBusinessPolicyService()
        self.shipping_support_policy = ProdigiShippingSupportPolicyService()
        self.storefront_settings = ProdigiStorefrontSettingsService(db)
        self.storefront_policy_version = STOREFRONT_POLICY_VERSION

    async def load_storefront_settings(self) -> dict[str, Any]:
        config = await self.storefront_settings.get_effective_config()
        self.apply_storefront_config(config)
        return config

    def apply_storefront_config(self, config: dict[str, Any]) -> None:
        self.shipping_support_policy.set_config(config["shipping_policy"])
        self.snapshot_service.apply_storefront_config(config)
        self.storefront_policy_version = str(config["payload_policy_version"])

    async def get_artwork_storefront(
        self,
        artwork_id_or_slug: str,
        country_code: str,
    ) -> dict[str, Any]:
        requested_country = (country_code or "").upper()
        materialized_payload = await self.read_model.get_artwork_payload(
            artwork_id_or_slug=artwork_id_or_slug,
            country_code=requested_country,
        )
        if materialized_payload is not None:
            return materialized_payload

        await self.load_storefront_settings()
        artwork = await self._get_artwork(artwork_id_or_slug)
        profile_bundle = await self.print_profile_service.get_profile_bundle(artwork.id)
        medium_availability = self._build_medium_availability(artwork)
        base_payload = self._build_base_payload(
            artwork=artwork,
            requested_country=requested_country,
            profile_bundle=profile_bundle,
            medium_availability=medium_availability,
        )
        if not (profile_bundle.get("print_aspect_ratio") or {}).get("label"):
            base_payload["message"] = (
                "Artwork has no assigned print aspect ratio, so storefront print offers "
                "cannot be resolved yet."
            )
            return base_payload
        base_payload["message"] = (
            "No current materialized storefront payload exists for this artwork and country. "
            "Rebuild the active Prodigi storefront payload before selling prints here."
        )
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
        categories_by_id = {item["category_id"]: item for item in snapshot.get("categories", [])}
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
            "storefront_policy_version": self.storefront_policy_version,
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

    def _materialized_payload_matches_current_policy(self, payload: dict[str, Any]) -> bool:
        return ProdigiStorefrontReadModelService.payload_matches_current_policy(payload)

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
        destination_country = (cell.get("destination_country") or "").upper()
        market_segment = get_market_priority(destination_country).get("segment", "rest")
        regional_multiplier = (
            self.snapshot_service._resolve_multiplier(destination_country, category_id)
            if hasattr(self.snapshot_service, "_resolve_multiplier")
            else None
        )

        for size_entry in cell.get("size_entries", []):
            if not size_entry.get("available"):
                continue

            # Re-evaluate business policy from raw baked data to prevent stale
            # policies (e.g. old "included" free-delivery mode) from leaking through.
            shipping_profiles = size_entry.get("shipping_profiles") or []
            shipping_support = self.shipping_support_policy.evaluate_size(shipping_profiles)
            business_policy = self._serialize_business_decision(
                self.business_policy.evaluate_print_business_rules(
                    category_id=category_id,
                    market_segment=market_segment,
                    product_price=size_entry.get("product_price"),
                    shipping_support=shipping_support,
                    multiplier_override=regional_multiplier,
                )
            )
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
                    "id": size_entry.get("id"),
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
                    "shipping_support": shipping_support,
                    "business_policy": business_policy,
                    "supplier_product_price": size_entry.get("product_price"),
                    "supplier_shipping_price": size_entry.get("shipping_price"),
                    "supplier_total_cost": (
                        round(
                            float(size_entry.get("product_price") or 0)
                            + float(size_entry.get("shipping_price") or 0),
                            2,
                        )
                        if size_entry.get("product_price") is not None
                        and size_entry.get("shipping_price") is not None
                        else size_entry.get("total_cost")
                    ),
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
            "geography_scope": cell.get("effective_geography_scope") or cell.get("geography_scope"),
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

    def _serialize_business_decision(self, decision: dict[str, Any]) -> dict[str, Any]:
        return {
            **decision,
            "retail_product_price": self._to_float(decision.get("retail_product_price")),
            "customer_shipping_price": self._to_float(decision.get("customer_shipping_price")),
            "shipping_price_for_margin": self._to_float(decision.get("shipping_price_for_margin")),
            "shipping_reference_price": self._to_float(decision.get("shipping_reference_price")),
            "shipping_credit_applied": self._to_float(decision.get("shipping_credit_applied")),
        }

    @staticmethod
    def _to_float(value: Any) -> float | None:
        if value is None:
            return None
        try:
            return float(value)
        except (TypeError, ValueError):
            return None
