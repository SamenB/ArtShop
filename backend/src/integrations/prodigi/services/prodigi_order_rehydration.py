from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from src.integrations.prodigi.services.prodigi_artwork_storefront import (
    CATEGORY_MEDIUM_MAP,
    ProdigiArtworkStorefrontService,
)
from src.integrations.prodigi.services.prodigi_attributes import normalize_prodigi_attributes
from src.models.artworks import ArtworksOrm
from src.models.prodigi_storefront import (
    ProdigiStorefrontBakeOrm,
    ProdigiStorefrontOfferGroupOrm,
    ProdigiStorefrontOfferSizeOrm,
)


class ProdigiOrderRehydrationError(ValueError):
    pass


@dataclass(slots=True)
class RehydratedProdigiSelection:
    offer_size_id: int
    sku: str
    category_id: str
    slot_size_label: str
    attributes: dict[str, Any]
    shipping_method: str | None
    wholesale_eur: float | None
    shipping_eur: float | None
    retail_eur: float | None
    customer_total_price: float | None
    size_label: str | None


class ProdigiOrderRehydrationService:
    """
    Rebuilds checkout Prodigi fields from the active baked storefront.

    The browser may carry display data, but this service is the fulfillment
    boundary: SKU, attributes, shipping method, prices, and pixel source all
    come back from the active bake before an order item is persisted.
    """

    def __init__(self, db):
        self.db = db
        self.storefront_builder = ProdigiArtworkStorefrontService(db)

    async def rehydrate_item(
        self,
        *,
        artwork: ArtworksOrm,
        item_data: Any,
        destination_country: str,
    ) -> RehydratedProdigiSelection | None:
        offer_size_id = getattr(item_data, "prodigi_storefront_offer_size_id", None)
        if offer_size_id is None and not self._has_fallback_prodigi_selection(item_data):
            return None

        size = None
        stmt = (
            select(ProdigiStorefrontOfferSizeOrm)
            .join(ProdigiStorefrontOfferSizeOrm.offer_group)
            .join(ProdigiStorefrontOfferGroupOrm.bake)
            .where(
                ProdigiStorefrontOfferSizeOrm.available.is_(True),
                ProdigiStorefrontBakeOrm.is_active.is_(True),
                ProdigiStorefrontOfferGroupOrm.destination_country == destination_country.upper(),
            )
            .options(
                selectinload(ProdigiStorefrontOfferSizeOrm.offer_group).selectinload(
                    ProdigiStorefrontOfferGroupOrm.bake
                )
            )
            .limit(1)
        )
        if offer_size_id is not None:
            result = await self.db.session.execute(
                stmt.where(ProdigiStorefrontOfferSizeOrm.id == int(offer_size_id))
            )
            size = result.scalar_one_or_none()

        if size is None and offer_size_id is None:
            size = await self._resolve_size_from_client_selection(
                item_data=item_data,
                destination_country=destination_country,
            )

        if size is None:
            raise ProdigiOrderRehydrationError(
                "Selected print size is not available in the active storefront bake."
            )

        group = size.offer_group
        expected_ratio = getattr(getattr(artwork, "print_aspect_ratio", None), "label", None)
        if expected_ratio and group.ratio_label != expected_ratio:
            raise ProdigiOrderRehydrationError(
                f"Selected print size ratio {group.ratio_label} does not match artwork ratio {expected_ratio}."
            )

        medium = CATEGORY_MEDIUM_MAP.get(group.category_id)
        if medium == "paper" and not self._paper_enabled(artwork, item_data):
            raise ProdigiOrderRehydrationError("Paper print is not enabled for this artwork.")
        if medium == "canvas" and not self._canvas_enabled(artwork, item_data):
            raise ProdigiOrderRehydrationError("Canvas print is not enabled for this artwork.")
        if not size.sku:
            raise ProdigiOrderRehydrationError("Selected print size has no Prodigi SKU.")

        storefront_size = self._build_storefront_size(group, size, artwork)
        client_attrs = getattr(item_data, "prodigi_attributes", None) or {}
        attributes = self._resolve_attributes(
            group=group,
            size=size,
            storefront_size=storefront_size,
            client_attrs=client_attrs,
        )

        wholesale_eur = self._float_or_none(size.product_price)
        shipping_eur = self._float_or_none(size.shipping_price)
        customer_total_price = storefront_size.get("customer_total_price")
        if customer_total_price is None and wholesale_eur is not None:
            customer_total_price = wholesale_eur + (shipping_eur or 0.0)

        return RehydratedProdigiSelection(
            offer_size_id=int(size.id),
            sku=str(size.sku),
            category_id=group.category_id,
            slot_size_label=size.slot_size_label,
            attributes=attributes,
            shipping_method=size.shipping_method or size.default_shipping_tier,
            wholesale_eur=wholesale_eur,
            shipping_eur=shipping_eur,
            retail_eur=storefront_size.get("retail_product_price"),
            customer_total_price=customer_total_price,
            size_label=size.size_label or size.slot_size_label,
        )

    def apply_to_item_add(
        self, item_add: Any, selection: RehydratedProdigiSelection | None
    ) -> None:
        if selection is None:
            return
        item_add.prodigi_storefront_offer_size_id = selection.offer_size_id
        item_add.prodigi_sku = selection.sku
        item_add.prodigi_category_id = selection.category_id
        item_add.prodigi_slot_size_label = selection.slot_size_label
        item_add.prodigi_attributes = selection.attributes
        item_add.prodigi_shipping_method = selection.shipping_method
        item_add.prodigi_wholesale_eur = selection.wholesale_eur
        item_add.prodigi_shipping_eur = selection.shipping_eur
        item_add.prodigi_retail_eur = selection.retail_eur
        if selection.customer_total_price is not None:
            item_add.price = int(round(selection.customer_total_price))
        if selection.size_label:
            item_add.size = selection.size_label

    async def _resolve_size_from_client_selection(
        self,
        *,
        item_data: Any,
        destination_country: str,
    ) -> ProdigiStorefrontOfferSizeOrm | None:
        category_id = str(getattr(item_data, "prodigi_category_id", "") or "").strip()
        slot_size_label = str(getattr(item_data, "prodigi_slot_size_label", "") or "").strip()
        sku = str(getattr(item_data, "prodigi_sku", "") or "").strip()
        if not category_id or not slot_size_label:
            return None

        base_stmt = (
            select(ProdigiStorefrontOfferSizeOrm)
            .join(ProdigiStorefrontOfferSizeOrm.offer_group)
            .join(ProdigiStorefrontOfferGroupOrm.bake)
            .where(
                ProdigiStorefrontOfferSizeOrm.available.is_(True),
                ProdigiStorefrontBakeOrm.is_active.is_(True),
                ProdigiStorefrontOfferGroupOrm.destination_country == destination_country.upper(),
                ProdigiStorefrontOfferGroupOrm.category_id == category_id,
                ProdigiStorefrontOfferSizeOrm.slot_size_label == slot_size_label,
            )
            .options(
                selectinload(ProdigiStorefrontOfferSizeOrm.offer_group).selectinload(
                    ProdigiStorefrontOfferGroupOrm.bake
                )
            )
            .order_by(ProdigiStorefrontOfferSizeOrm.id.desc())
        )
        if sku:
            result = await self.db.session.execute(
                base_stmt.where(ProdigiStorefrontOfferSizeOrm.sku == sku).limit(1)
            )
            exact = result.scalar_one_or_none()
            if exact is not None:
                return exact

        result = await self.db.session.execute(base_stmt.limit(1))
        return result.scalar_one_or_none()

    def _has_fallback_prodigi_selection(self, item_data: Any) -> bool:
        return bool(
            getattr(item_data, "prodigi_category_id", None)
            and getattr(item_data, "prodigi_slot_size_label", None)
        )

    def _build_storefront_size(
        self,
        group: ProdigiStorefrontOfferGroupOrm,
        size: ProdigiStorefrontOfferSizeOrm,
        artwork: ArtworksOrm,
    ) -> dict[str, Any]:
        card = self.storefront_builder._build_category_card(
            category_meta={
                "category_id": group.category_id,
                "label": group.category_label,
                "material_label": group.material_label,
                "frame_label": group.frame_label,
            },
            cell={
                "category_id": group.category_id,
                "storefront_action": group.storefront_action,
                "effective_fulfillment_level": group.fulfillment_level,
                "effective_geography_scope": group.geography_scope,
                "effective_tax_risk": group.tax_risk,
                "fixed_attributes": group.fixed_attributes or {},
                "recommended_defaults": group.recommended_defaults or {},
                "allowed_attributes": group.allowed_attributes or {},
                "size_entries": [
                    {
                        "id": size.id,
                        "slot_size_label": size.slot_size_label,
                        "size_label": size.size_label or size.slot_size_label,
                        "available": bool(size.available),
                        "sku": size.sku,
                        "supplier_size_cm": size.supplier_size_cm,
                        "supplier_size_inches": size.supplier_size_inches,
                        "print_area": {
                            "width_px": size.print_area_width_px,
                            "height_px": size.print_area_height_px,
                            "name": size.print_area_name,
                            "source": size.print_area_source,
                            "dimensions": size.print_area_dimensions,
                        },
                        "provider_attributes": {},
                        "source_country": size.source_country,
                        "currency": size.currency,
                        "product_price": self._float_or_none(size.product_price),
                        "shipping_price": self._float_or_none(size.shipping_price),
                        "total_cost": self._float_or_none(size.total_cost),
                        "delivery_days": size.delivery_days,
                        "default_shipping_tier": size.default_shipping_tier,
                        "shipping_method": size.shipping_method,
                        "service_name": size.service_name,
                        "service_level": size.service_level,
                        "shipping_profiles": size.shipping_profiles or [],
                        "shipping_support": {},
                        "business_policy": {},
                    }
                ],
            },
            effective_profile=None,
            medium_availability=self.storefront_builder._build_medium_availability(artwork),
        )
        if not card or not card.get("size_options"):
            return {}
        return card["size_options"][0]

    def _resolve_attributes(
        self,
        *,
        group: ProdigiStorefrontOfferGroupOrm,
        size: ProdigiStorefrontOfferSizeOrm,
        storefront_size: dict[str, Any],
        client_attrs: dict[str, Any],
    ) -> dict[str, Any]:
        allowed = group.allowed_attributes or {}
        defaults = {}
        defaults.update(
            size.print_area_dimensions.get("variant_attributes", {})
            if isinstance(size.print_area_dimensions, dict)
            else {}
        )
        defaults.update(storefront_size.get("provider_attributes") or {})
        defaults.update(group.fixed_attributes or {})
        defaults.update(group.recommended_defaults or {})

        resolved = {key: value for key, value in defaults.items() if value not in (None, "")}
        for key, value in client_attrs.items():
            if value in (None, ""):
                continue
            if key not in allowed:
                continue
            allowed_values = {str(item) for item in allowed.get(key) or []}
            if allowed_values and str(value) not in allowed_values:
                raise ProdigiOrderRehydrationError(
                    f"Selected Prodigi attribute {key}={value} is not allowed for this option."
                )
            resolved[key] = value
        return normalize_prodigi_attributes(resolved)

    def _paper_enabled(self, artwork: ArtworksOrm, item_data: Any) -> bool:
        return bool(
            getattr(artwork, "has_paper_print", False)
            or getattr(artwork, "has_paper_print_limited", False)
            or str(getattr(item_data, "edition_type", "")).startswith("paper_")
        )

    def _canvas_enabled(self, artwork: ArtworksOrm, item_data: Any) -> bool:
        return bool(
            getattr(artwork, "has_canvas_print", False)
            or getattr(artwork, "has_canvas_print_limited", False)
            or str(getattr(item_data, "edition_type", "")).startswith("canvas_")
        )

    def _float_or_none(self, value: Any) -> float | None:
        return float(value) if value is not None else None
