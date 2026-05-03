from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from src.integrations.prodigi.services.prodigi_artwork_storefront import (
    CATEGORY_MEDIUM_MAP,
)
from src.integrations.prodigi.services.prodigi_storefront_read_model import (
    ProdigiStorefrontReadModelService,
)
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
    bake_id: int
    policy_version: str
    offer_size_id: int
    sku: str
    category_id: str
    slot_size_label: str
    attributes: dict[str, Any]
    shipping_tier: str | None
    shipping_method: str | None
    delivery_days: str | None
    wholesale_eur: float | None
    shipping_eur: float | None  # supplier/wholesale shipping cost
    customer_shipping_eur: float | None  # customer-facing shipping price
    retail_eur: float | None
    customer_total_price: float | None
    size_label: str | None
    supplier_currency: str | None


class ProdigiOrderRehydrationService:
    """
    Rebuilds checkout Prodigi fields from the active materialized storefront.

    The browser may carry display data, but this service is the fulfillment and
    payment boundary: SKU, attributes, customer prices, shipping, and supplier
    costs all come from the active payload before an order item is persisted.
    """

    def __init__(self, db):
        self.db = db
        self.read_model = ProdigiStorefrontReadModelService(db)

    async def rehydrate_item(
        self,
        *,
        artwork: ArtworksOrm,
        item_data: Any,
        destination_country: str,
    ) -> RehydratedProdigiSelection:
        if getattr(item_data, "prodigi_storefront_offer_size_id", None) is None:
            raise ProdigiOrderRehydrationError(
                "Print item is missing its materialized storefront offer size id."
            )

        try:
            selection = await self.read_model.resolve_customer_selection(
                artwork_id_or_slug=str(getattr(artwork, "slug", "") or getattr(artwork, "id")),
                country_code=destination_country,
                item_data=item_data,
            )
        except ValueError as exc:
            raise ProdigiOrderRehydrationError(str(exc)) from exc

        size = await self._get_active_offer_size(
            offer_size_id=selection.offer_size_id,
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

        return RehydratedProdigiSelection(
            bake_id=selection.bake_id,
            policy_version=selection.policy_version,
            offer_size_id=int(size.id),
            sku=str(size.sku),
            category_id=group.category_id,
            slot_size_label=size.slot_size_label,
            attributes=selection.attributes,
            shipping_tier=selection.shipping_tier,
            shipping_method=selection.shipping_method or size.shipping_method,
            delivery_days=selection.shipping_delivery_days,
            wholesale_eur=selection.supplier_product_cost,
            shipping_eur=selection.supplier_shipping_cost,
            customer_shipping_eur=selection.customer_shipping_price,
            retail_eur=selection.customer_product_price,
            customer_total_price=selection.customer_total_price,
            size_label=selection.size_label or size.size_label or size.slot_size_label,
            supplier_currency=selection.supplier_currency or size.currency,
        )

    async def _get_active_offer_size(
        self,
        *,
        offer_size_id: int,
        destination_country: str,
    ) -> ProdigiStorefrontOfferSizeOrm | None:
        stmt = (
            select(ProdigiStorefrontOfferSizeOrm)
            .join(ProdigiStorefrontOfferSizeOrm.offer_group)
            .join(ProdigiStorefrontOfferGroupOrm.bake)
            .where(
                ProdigiStorefrontOfferSizeOrm.id == offer_size_id,
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
        result = await self.db.session.execute(stmt)
        return result.scalar_one_or_none()

    def apply_to_item_add(self, item_add: Any, selection: RehydratedProdigiSelection) -> None:
        item_add.prodigi_storefront_offer_size_id = selection.offer_size_id
        item_add.prodigi_sku = selection.sku
        item_add.prodigi_category_id = selection.category_id
        item_add.prodigi_slot_size_label = selection.slot_size_label
        item_add.prodigi_attributes = selection.attributes
        item_add.prodigi_storefront_bake_id = selection.bake_id
        item_add.prodigi_storefront_policy_version = selection.policy_version
        item_add.prodigi_shipping_tier = selection.shipping_tier
        item_add.prodigi_shipping_method = selection.shipping_method
        item_add.prodigi_delivery_days = selection.delivery_days
        item_add.prodigi_wholesale_eur = selection.wholesale_eur
        item_add.prodigi_shipping_eur = selection.shipping_eur
        item_add.prodigi_supplier_total_eur = self._sum_money(
            selection.wholesale_eur,
            selection.shipping_eur,
        )
        item_add.prodigi_retail_eur = selection.retail_eur
        item_add.prodigi_supplier_currency = selection.supplier_currency or "EUR"
        item_add.customer_product_price = selection.retail_eur
        item_add.customer_shipping_price = selection.customer_shipping_eur
        item_add.customer_line_total = selection.customer_total_price
        item_add.customer_currency = "USD"
        if selection.customer_total_price is not None:
            retail_rounded = math.floor(float(selection.retail_eur or 0) + 0.5)
            shipping_rounded = math.floor(float(selection.customer_shipping_eur or 0) + 0.5)
            item_add.price = int(retail_rounded + shipping_rounded)
        if selection.size_label:
            item_add.size = selection.size_label

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

    def _sum_money(self, *values: float | None) -> float | None:
        present = [float(value) for value in values if value is not None]
        if not present:
            return None
        return round(sum(present), 2)
