from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from src.integrations.prodigi.repositories.prodigi_storefront import ProdigiStorefrontRepository
from src.integrations.prodigi.services.prodigi_attributes import normalize_prodigi_attributes
from src.integrations.prodigi.services.prodigi_business_policy import ProdigiBusinessPolicyService
from src.integrations.prodigi.services.prodigi_storefront_settings import (
    ProdigiStorefrontSettingsService,
)

STOREFRONT_POLICY_VERSION = ProdigiBusinessPolicyService.POLICY_VERSION


@dataclass(slots=True)
class ResolvedStorefrontPrintSelection:
    card: dict[str, Any]
    size: dict[str, Any]
    attributes: dict[str, Any]


@dataclass(slots=True)
class StorefrontSelection:
    bake_id: int
    policy_version: str
    offer_size_id: int
    country: str
    category: str
    slot: str
    sku: str
    attributes: dict[str, Any]
    customer_product_price: float
    customer_shipping_price: float
    customer_total_price: float
    customer_currency: str
    shipping_tier: str | None
    shipping_method: str | None
    shipping_delivery_days: str | None
    supplier_product_cost: float | None
    supplier_shipping_cost: float | None
    supplier_total_cost: float | None
    supplier_currency: str | None
    size_label: str | None


class ProdigiStorefrontReadModelService:
    """
    Runtime source of truth for customer-facing Prodigi storefront data.

    Public pages, checkout, order creation, and admin order economics should read
    from the materialized artwork payload. Raw baked offer groups remain an admin
    snapshot/build input, not a runtime pricing fallback.
    """

    def __init__(self, db):
        self.db = db
        self.repository = ProdigiStorefrontRepository(db.session)
        self.settings_service = ProdigiStorefrontSettingsService(db)

    async def get_artwork_payload(
        self,
        *,
        artwork_id_or_slug: str,
        country_code: str,
    ) -> dict[str, Any] | None:
        active_bake = await self.repository.get_active_bake()
        if active_bake is None:
            return None

        row = await self.repository.get_materialized_payload_for_ref(
            bake_id=active_bake.id,
            artwork_id_or_slug=artwork_id_or_slug,
            country_code=(country_code or "").upper(),
        )
        if row is None or not row.payload:
            return None
        payload = dict(row.payload)
        expected_policy_version = await self.settings_service.get_payload_policy_version()
        if not self.payload_matches_policy_version(payload, expected_policy_version):
            return None
        return payload

    async def resolve_customer_selection(
        self,
        *,
        artwork_id_or_slug: str,
        country_code: str,
        item_data: Any,
    ) -> StorefrontSelection:
        active_bake = await self.repository.get_active_bake()
        if active_bake is None:
            raise ValueError("No active materialized storefront bake exists.")

        normalized_country = (country_code or "").upper()
        row = await self.repository.get_materialized_payload_for_ref(
            bake_id=active_bake.id,
            artwork_id_or_slug=artwork_id_or_slug,
            country_code=normalized_country,
        )
        if row is None or not row.payload:
            raise ValueError(
                "No current materialized storefront payload exists for this order country."
            )

        payload = dict(row.payload)
        expected_policy_version = await self.settings_service.get_payload_policy_version()
        if not self.payload_matches_policy_version(payload, expected_policy_version):
            raise ValueError(
                "The active storefront payload is stale. Rebuild the storefront payload before selling prints."
            )

        selection = self.resolve_print_selection(payload=payload, item_data=item_data)
        return self._build_customer_selection(
            bake_id=int(active_bake.id),
            policy_version=str(payload.get("storefront_policy_version") or ""),
            country=normalized_country,
            selection=selection,
        )

    async def get_artwork_summaries(
        self,
        *,
        artwork_ids: list[int],
        country_code: str,
    ) -> dict[int, dict[str, Any]]:
        if not artwork_ids:
            return {}

        active_bake = await self.repository.get_active_bake()
        if active_bake is None:
            return {}

        rows = await self.repository.get_materialized_summaries(
            bake_id=active_bake.id,
            artwork_ids=artwork_ids,
            country_code=(country_code or "").upper(),
        )
        expected_policy_version = await self.settings_service.get_payload_policy_version()
        summaries: dict[int, dict[str, Any]] = {}
        for row in rows:
            payload = dict(getattr(row, "payload", None) or {})
            if payload and not self.payload_matches_policy_version(
                payload,
                expected_policy_version,
            ):
                continue
            summaries[row.artwork_id] = dict(row.summary or {})
        return summaries

    def resolve_print_selection(
        self,
        *,
        payload: dict[str, Any],
        item_data: Any,
    ) -> ResolvedStorefrontPrintSelection:
        size_id = self._int_or_none(getattr(item_data, "prodigi_storefront_offer_size_id", None))
        category_id = str(getattr(item_data, "prodigi_category_id", "") or "").strip()
        slot_size_label = str(getattr(item_data, "prodigi_slot_size_label", "") or "").strip()
        sku = str(getattr(item_data, "prodigi_sku", "") or "").strip()

        for card in self.iter_cards(payload):
            if category_id and card.get("category_id") != category_id:
                continue
            for size in card.get("size_options") or []:
                if size_id is not None and self._int_or_none(size.get("id")) != size_id:
                    continue
                if size_id is None:
                    if slot_size_label and size.get("slot_size_label") != slot_size_label:
                        continue
                    if sku and size.get("sku") != sku:
                        continue
                if not self._is_customer_available_size(size):
                    continue
                return ResolvedStorefrontPrintSelection(
                    card=card,
                    size=size,
                    attributes=self._resolve_attributes(
                        card=card,
                        size=size,
                        client_attrs=getattr(item_data, "prodigi_attributes", None) or {},
                    ),
                )

        raise ValueError("Selected print size is not available in the materialized storefront.")

    def _build_customer_selection(
        self,
        *,
        bake_id: int,
        policy_version: str,
        country: str,
        selection: ResolvedStorefrontPrintSelection,
    ) -> StorefrontSelection:
        card = selection.card
        size = selection.size
        shipping_support = size.get("shipping_support") or {}

        offer_size_id = self._int_or_none(size.get("id"))
        customer_product = self._float_or_none(size.get("retail_product_price"))
        customer_shipping = self._float_or_none(size.get("customer_shipping_price"))
        customer_total = self._float_or_none(size.get("customer_total_price"))

        if offer_size_id is None:
            raise ValueError("Selected print size has no materialized storefront offer size id.")
        if customer_product is None or customer_shipping is None or customer_total is None:
            raise ValueError("Selected print size is missing customer pricing in the active payload.")
        if abs((customer_product + customer_shipping) - customer_total) > 0.01:
            raise ValueError(
                "Selected print customer total does not match product plus shipping in the active payload."
            )

        supplier_product = self._float_or_none(
            shipping_support.get("chosen_product_price")
            if shipping_support.get("chosen_product_price") is not None
            else size.get("supplier_product_price")
        )
        supplier_shipping = self._float_or_none(
            shipping_support.get("chosen_shipping_price")
            if shipping_support.get("chosen_shipping_price") is not None
            else size.get("supplier_shipping_price")
        )
        supplier_total = self._float_or_none(size.get("supplier_total_cost"))
        if supplier_total is None and supplier_product is not None:
            supplier_total = round(supplier_product + (supplier_shipping or 0.0), 2)

        return StorefrontSelection(
            bake_id=bake_id,
            policy_version=policy_version,
            offer_size_id=offer_size_id,
            country=country,
            category=str(card.get("category_id") or ""),
            slot=str(size.get("slot_size_label") or ""),
            sku=str(size.get("sku") or ""),
            attributes=selection.attributes,
            customer_product_price=customer_product,
            customer_shipping_price=customer_shipping,
            customer_total_price=customer_total,
            customer_currency=str(size.get("customer_currency") or "USD"),
            shipping_tier=shipping_support.get("chosen_tier")
            or size.get("default_shipping_tier"),
            shipping_method=shipping_support.get("chosen_shipping_method")
            or size.get("shipping_method")
            or size.get("default_shipping_tier"),
            shipping_delivery_days=shipping_support.get("chosen_delivery_days")
            or size.get("delivery_days"),
            supplier_product_cost=supplier_product,
            supplier_shipping_cost=supplier_shipping,
            supplier_total_cost=supplier_total,
            supplier_currency=shipping_support.get("chosen_currency")
            or size.get("currency")
            or "EUR",
            size_label=size.get("size_label") or size.get("slot_size_label"),
        )

    @staticmethod
    def iter_cards(payload: dict[str, Any]):
        mediums = payload.get("mediums") or {}
        for medium in ("paper", "canvas"):
            for card in (mediums.get(medium) or {}).get("cards") or []:
                yield card

    @staticmethod
    def payload_matches_current_policy(payload: dict[str, Any]) -> bool:
        return ProdigiStorefrontReadModelService.payload_matches_policy_version(
            payload,
            STOREFRONT_POLICY_VERSION,
        )

    @staticmethod
    def payload_matches_policy_version(payload: dict[str, Any], policy_version: str) -> bool:
        if payload.get("storefront_policy_version") != policy_version:
            return False

        for card in ProdigiStorefrontReadModelService.iter_cards(payload):
            for size in card.get("size_options") or []:
                business_policy = size.get("business_policy") or {}
                if business_policy.get("shipping_mode") == "included":
                    return False
                if business_policy.get("free_delivery_badge") is True:
                    return False
                if business_policy.get("policy_family") == "unframed_free_delivery":
                    return False
        return True

    def _resolve_attributes(
        self,
        *,
        card: dict[str, Any],
        size: dict[str, Any],
        client_attrs: dict[str, Any],
    ) -> dict[str, Any]:
        allowed = card.get("allowed_attribute_options") or {}
        defaults: dict[str, Any] = {}
        defaults.update(card.get("default_prodigi_attributes") or {})
        defaults.update(size.get("provider_attributes") or {})

        resolved = {key: value for key, value in defaults.items() if value not in (None, "")}
        for key, value in client_attrs.items():
            if value in (None, "") or key not in allowed:
                continue
            allowed_values = {str(item) for item in allowed.get(key) or []}
            if allowed_values and str(value) not in allowed_values:
                raise ValueError(
                    f"Selected Prodigi attribute {key}={value} is not allowed for this option."
                )
            resolved[key] = value
        return normalize_prodigi_attributes(resolved)

    def _is_customer_available_size(self, size: dict[str, Any]) -> bool:
        if size.get("customer_total_price") is None:
            return False
        if size.get("retail_product_price") is None:
            return False
        if size.get("customer_shipping_price") is None:
            return False
        if (size.get("business_policy") or {}).get("shipping_mode") == "hide":
            return False
        if (size.get("shipping_support") or {}).get("status") != "covered":
            return False
        return True

    @staticmethod
    def _float_or_none(value: Any) -> float | None:
        if value is None:
            return None
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _int_or_none(value: Any) -> int | None:
        if value is None:
            return None
        try:
            return int(value)
        except (TypeError, ValueError):
            return None
