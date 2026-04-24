from __future__ import annotations

import logging
import re
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from src.config import settings
from src.connectors.prodigi import ProdigiClient, ProductDetails, ProductVariant

log = logging.getLogger(__name__)

TARGET_DPI = 300
DIMENSION_PATTERN = re.compile(r"(?P<w>\d+(?:\.\d+)?)\s*x\s*(?P<h>\d+(?:\.\d+)?)", re.IGNORECASE)


class ProdigiPrintAreaResolver:
    """
    Resolves exact print-area pixel dimensions for baked storefront sizes.

    Priority:
    1. Prodigi Product Details API variant printAreaSizes.
    2. Supplier inches from CSV, converted with Decimal half-up rounding.
    3. Supplier centimeters from CSV, converted to inches with Decimal arithmetic.
    4. Human slot label as last resort only.
    """

    def __init__(self, *, target_dpi: int = TARGET_DPI):
        self.target_dpi = target_dpi
        self._client: ProdigiClient | None = None
        self._product_cache: dict[str, ProductDetails | None] = {}
        self._resolution_cache: dict[tuple[Any, ...], dict[str, Any]] = {}

    async def __aenter__(self) -> "ProdigiPrintAreaResolver":
        if settings.PRODIGI_API_KEY:
            self._client = ProdigiClient(sandbox=settings.PRODIGI_SANDBOX)
            await self._client.__aenter__()
        return self

    async def __aexit__(self, *args: Any) -> None:
        if self._client is not None:
            await self._client.__aexit__(*args)
            self._client = None

    async def resolve(
        self,
        *,
        sku: str | None,
        destination_country: str | None,
        category_id: str,
        attributes: dict[str, Any] | None,
        optional_attribute_keys: set[str] | None = None,
        supplier_size_inches: str | None,
        supplier_size_cm: str | None,
        slot_size_label: str | None,
        wrap_margin_pct: float = 0.0,
    ) -> dict[str, Any]:
        cache_key = (
            (sku or "").strip().upper(),
            (destination_country or "").upper(),
            category_id,
            tuple(sorted((attributes or {}).items())),
            tuple(sorted(optional_attribute_keys or set())),
            supplier_size_inches,
            supplier_size_cm,
            slot_size_label,
            wrap_margin_pct,
        )
        cached = self._resolution_cache.get(cache_key)
        if cached is not None:
            return dict(cached)

        api_dimensions = await self._resolve_from_product_details(
            sku=sku,
            destination_country=destination_country,
            attributes=attributes or {},
            optional_attribute_keys=optional_attribute_keys or set(),
        )
        if api_dimensions is not None:
            resolved = {
                **api_dimensions,
                "target_dpi": self.target_dpi,
                "wrap_margin_pct": None,
            }
            self._resolution_cache[cache_key] = dict(resolved)
            return resolved

        fallback = self._resolve_from_physical_size(
            supplier_size_inches=supplier_size_inches,
            supplier_size_cm=supplier_size_cm,
            slot_size_label=slot_size_label,
            wrap_margin_pct=wrap_margin_pct,
        )
        resolved = {
            **fallback,
            "target_dpi": self.target_dpi,
            "wrap_margin_pct": wrap_margin_pct,
            "category_id": category_id,
        }
        self._resolution_cache[cache_key] = dict(resolved)
        return resolved

    async def _resolve_from_product_details(
        self,
        *,
        sku: str | None,
        destination_country: str | None,
        attributes: dict[str, Any],
        optional_attribute_keys: set[str],
    ) -> dict[str, Any] | None:
        normalized_sku = (sku or "").strip().upper()
        if not normalized_sku or self._client is None:
            return None

        product = await self._get_product(normalized_sku)
        if product is None:
            return None

        variant = self._select_variant(
            product=product,
            destination_country=destination_country,
            attributes=attributes,
            optional_attribute_keys=optional_attribute_keys,
        )
        if variant is None:
            return None

        area_name, dimensions = self._first_print_area_dimensions(variant.print_area_sizes)
        if dimensions is not None:
            width = self._positive_int(dimensions.get("horizontalResolution"))
            height = self._positive_int(dimensions.get("verticalResolution"))
            if width is None or height is None:
                return None
            visible_width = self._decimal_px(Decimal(str(product.width_in)))
            visible_height = self._decimal_px(Decimal(str(product.height_in)))

            return {
                "print_area_width_px": width,
                "print_area_height_px": height,
                "visible_art_width_px": visible_width,
                "visible_art_height_px": visible_height,
                "print_area_name": area_name,
                "print_area_source": "prodigi_product_details",
                "print_area_dimensions": {
                    "sku": normalized_sku,
                    "print_area": area_name,
                    "variant_attributes": variant.attributes,
                    "horizontalResolution": width,
                    "verticalResolution": height,
                    "visible_art_width_px": visible_width,
                    "visible_art_height_px": visible_height,
                    "physical_width_in": product.width_in,
                    "physical_height_in": product.height_in,
                },
            }

        visible_width = self._decimal_px(Decimal(str(product.width_in)))
        visible_height = self._decimal_px(Decimal(str(product.height_in)))
        return {
            "print_area_width_px": visible_width,
            "print_area_height_px": visible_height,
            "visible_art_width_px": visible_width,
            "visible_art_height_px": visible_height,
            "print_area_name": "product_dimensions",
            "print_area_source": "prodigi_product_dimensions",
            "print_area_dimensions": {
                "sku": normalized_sku,
                "print_area": "product_dimensions",
                "variant_attributes": variant.attributes,
                "width_in": product.width_in,
                "height_in": product.height_in,
                "dpi": self.target_dpi,
                "visible_art_width_px": visible_width,
                "visible_art_height_px": visible_height,
            },
        }

    async def _get_product(self, sku: str) -> ProductDetails | None:
        if sku not in self._product_cache:
            try:
                assert self._client is not None
                self._product_cache[sku] = await self._client.get_product(sku)
            except Exception as exc:
                log.warning("Could not fetch Prodigi product details for %s: %s", sku, exc)
                self._product_cache[sku] = None
        return self._product_cache[sku]

    def _select_variant(
        self,
        *,
        product: ProductDetails,
        destination_country: str | None,
        attributes: dict[str, Any],
        optional_attribute_keys: set[str],
    ) -> ProductVariant | None:
        variants = product.variants
        country = (destination_country or "").upper()
        if country:
            country_variants = [variant for variant in variants if country in variant.ships_to]
            if country_variants:
                variants = country_variants

        if not variants:
            return None

        wanted = {
            self._normalize_attr_key(key): self._normalize_attr_value(value)
            for key, value in attributes.items()
            if value is not None and str(value).strip()
        }
        if wanted:
            for variant in variants:
                available = {
                    self._normalize_attr_key(key): self._normalize_attr_value(value)
                    for key, value in variant.attributes.items()
                }
                if all(available.get(key) == value for key, value in wanted.items()):
                    return variant
            optional = {self._normalize_attr_key(key) for key in optional_attribute_keys}
            required = {
                key: value
                for key, value in wanted.items()
                if key not in optional
            }
            if optional and required:
                for variant in variants:
                    available = {
                        self._normalize_attr_key(key): self._normalize_attr_value(value)
                        for key, value in variant.attributes.items()
                    }
                    if all(available.get(key) == value for key, value in required.items()):
                        return variant
            return None

        return variants[0]

    def _resolve_from_physical_size(
        self,
        *,
        supplier_size_inches: str | None,
        supplier_size_cm: str | None,
        slot_size_label: str | None,
        wrap_margin_pct: float,
    ) -> dict[str, Any]:
        inches = self._parse_dimensions(supplier_size_inches)
        source = "supplier_size_inches_fallback"
        units = "in"
        if inches is None:
            cm = self._parse_dimensions(supplier_size_cm)
            if cm is not None:
                inches = (cm[0] / Decimal("2.54"), cm[1] / Decimal("2.54"))
                source = "supplier_size_cm_fallback"
                units = "cm"
        if inches is None:
            label_dims = self._parse_dimensions(slot_size_label)
            if label_dims is not None:
                inches = (label_dims[0] / Decimal("2.54"), label_dims[1] / Decimal("2.54"))
                source = "slot_size_label_fallback"
                units = "cm"
        if inches is None:
            return {
                "print_area_width_px": None,
                "print_area_height_px": None,
                "print_area_name": "default",
                "print_area_source": "unresolved",
                "print_area_dimensions": {
                    "reason": "No parseable supplier or slot dimensions were available.",
                    "supplier_size_inches": supplier_size_inches,
                    "supplier_size_cm": supplier_size_cm,
                    "slot_size_label": slot_size_label,
                },
            }

        multiplier = Decimal("1") + (Decimal(str(wrap_margin_pct)) / Decimal("100") * Decimal("2"))
        width_px = self._decimal_px(inches[0] * multiplier)
        height_px = self._decimal_px(inches[1] * multiplier)
        return {
            "print_area_width_px": width_px,
            "print_area_height_px": height_px,
            "visible_art_width_px": width_px,
            "visible_art_height_px": height_px,
            "print_area_name": "default",
            "print_area_source": source,
            "print_area_dimensions": {
                "units": units,
                "supplier_size_inches": supplier_size_inches,
                "supplier_size_cm": supplier_size_cm,
                "slot_size_label": slot_size_label,
                "width_in": str(inches[0]),
                "height_in": str(inches[1]),
                "dpi": self.target_dpi,
                "wrap_margin_pct": wrap_margin_pct,
                "visible_art_width_px": width_px,
                "visible_art_height_px": height_px,
            },
        }

    def _parse_dimensions(self, value: str | None) -> tuple[Decimal, Decimal] | None:
        if not value:
            return None
        normalized = (
            str(value)
            .lower()
            .replace("×", "x")
            .replace('"', "")
            .replace("inches", "")
            .replace("inch", "")
            .replace("cm", "")
            .strip()
        )
        match = DIMENSION_PATTERN.search(normalized)
        if not match:
            return None
        return Decimal(match.group("w")), Decimal(match.group("h"))

    def _decimal_px(self, inches: Decimal) -> int:
        return int((inches * Decimal(self.target_dpi)).quantize(Decimal("1"), rounding=ROUND_HALF_UP))

    def _first_print_area_dimensions(
        self,
        print_area_sizes: dict[str, dict[str, Any]],
    ) -> tuple[str, dict[str, Any] | None]:
        if not print_area_sizes:
            return "default", None
        if "default" in print_area_sizes:
            return "default", print_area_sizes["default"]
        area_name = sorted(print_area_sizes.keys())[0]
        return area_name, print_area_sizes[area_name]

    def _positive_int(self, value: Any) -> int | None:
        try:
            parsed = int(value)
        except (TypeError, ValueError):
            return None
        return parsed if parsed > 0 else None

    def _normalize_attr_key(self, value: Any) -> str:
        return re.sub(r"[^a-z0-9]+", "", str(value or "").strip().lower())

    def _normalize_attr_value(self, value: Any) -> str:
        return re.sub(r"[^a-z0-9]+", "", str(value or "").strip().lower())
