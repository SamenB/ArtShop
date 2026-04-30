from __future__ import annotations

import json
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

CURATED_VERSION_FIELD = "__prodigi_curated_version"
CURATED_VERSION = "1"


def _clean(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = str(value).strip().strip('"')
    return cleaned or None


def _to_decimal(value: str | None) -> Decimal | None:
    if value is None:
        return None
    cleaned = value.strip().replace(",", "")
    if not cleaned:
        return None
    try:
        return Decimal(cleaned)
    except (InvalidOperation, ValueError):
        return None


def _to_int(value: str | None) -> int | None:
    if value is None:
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    try:
        return int(float(cleaned))
    except ValueError:
        return None


def _to_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    return str(value or "").strip().lower() in {"1", "true", "yes", "y"}


def _pick(row: dict[str, Any], *names: str) -> str | None:
    for name in names:
        value = _clean(row.get(name))
        if value is not None:
            return value
    return None


def _paper_material_slug(paper_type: str | None, description: str | None) -> str | None:
    joined = " ".join(filter(None, [paper_type, description])).lower()
    if not joined:
        return None
    if "photo rag" in joined or "hpr" in joined:
        return "hahnemuhle_photo_rag"
    if "german etching" in joined or "hge" in joined:
        return "hahnemuhle_german_etching"
    if "baryta" in joined or "bap" in joined:
        return "baryta_art_paper"
    if "smooth art paper" in joined or "sap" in joined:
        return "smooth_art_paper"
    if "enhanced matte" in joined or "ema" in joined:
        return "enhanced_matte_art_paper"
    if "cold press watercolour" in joined or "cpwp" in joined:
        return "cold_press_watercolour_paper"
    return None


def _canvas_material_slug(paper_type: str | None, description: str | None) -> str | None:
    joined = " ".join(filter(None, [paper_type, description])).lower()
    if not joined:
        return None
    if "pro canvas" in joined or "(pc)" in joined:
        return "pro_canvas"
    if "standard canvas" in joined or "(sc)" in joined:
        return "standard_canvas"
    if "metallic canvas" in joined or "(mc)" in joined:
        return "metallic_canvas"
    if "cotton canvas" in joined or "(cc)" in joined:
        return "cotton_canvas"
    return None


def _normalize_medium(product_type: str | None) -> str | None:
    value = (product_type or "").lower()
    if "canvas" in value:
        return "canvas"
    if "print" in value:
        return "paper"
    return None


def _normalize_presentation(product_type: str | None) -> str | None:
    value = (product_type or "").lower()
    if "art prints" in value:
        return "rolled"
    if "rolled canvas" in value:
        return "rolled"
    if "stretched canvas" in value:
        return "stretched"
    if "framed" in value:
        return "framed"
    return None


def _normalize_frame_type(
    product_type: str | None,
    frame: str | None,
    description: str | None,
) -> str | None:
    haystack = " ".join(filter(None, [product_type, frame, description])).lower()
    if "float frame" in haystack or "float framed" in haystack:
        return "floating_frame"
    if "box frame" in haystack or frame == "Box":
        return "box_frame"
    if "classic frame" in haystack or "classic framed" in haystack or frame == "Classic":
        return "classic_frame"
    if "stretched canvas" in haystack:
        return "stretched_canvas"
    if "rolled" in haystack or "no frame" in haystack:
        return "no_frame"
    return None


def _is_relevant_for_artshop(
    medium: str | None,
    presentation: str | None,
    frame_type: str | None,
    material: str | None = None,
    description: str | None = None,
    sku: str | None = None,
) -> bool:
    description_lower = (description or "").lower()
    sku_upper = (sku or "").upper()

    if medium == "paper" and presentation == "rolled":
        return True
    if medium == "paper" and frame_type == "box_frame":
        return True
    if medium == "paper" and frame_type == "classic_frame":
        return True
    if medium == "canvas" and material == "metallic_canvas":
        return False
    if medium == "canvas" and presentation == "rolled":
        return True
    if medium == "canvas" and frame_type == "classic_frame":
        return True
    if medium == "canvas" and presentation == "stretched":
        return "19mm" not in description_lower and "SLIMCAN" not in sku_upper
    if medium == "canvas" and frame_type == "floating_frame":
        return True
    return False


def _build_variant_key(attributes: dict[str, str | None]) -> str:
    payload = {k: v for k, v in attributes.items() if v is not None}
    return json.dumps(payload, sort_keys=True, ensure_ascii=True) if payload else "base"


def _build_route_key(
    sku: str,
    variant_key: str,
    source_country: str | None,
    destination_country: str | None,
    shipping_method: str | None,
    service_name: str | None,
    service_level: str | None,
) -> str:
    parts = [
        sku,
        variant_key,
        source_country or "",
        destination_country or "",
        shipping_method or "",
        service_name or "",
        service_level or "",
    ]
    return "|".join(parts)


def parse_prodigi_csv_row(file_path: Path, row: dict[str, Any]) -> dict[str, Any] | None:
    if CURATED_VERSION_FIELD in row:
        return parse_curated_prodigi_csv_row(row)

    sku = _pick(row, "SKU")
    if sku is None:
        return None

    category = _pick(row, "Category")
    product_type = _pick(row, "Product type")
    description = _pick(row, "Product description")

    attributes = {
        "finish": _pick(row, "Finish"),
        "color": _pick(row, "Color"),
        "frame": _pick(row, "Frame"),
        "style": _pick(row, "Style"),
        "glaze": _pick(row, "Glaze"),
        "mount": _pick(row, "Mount"),
        "mount_color": _pick(row, "Mount color"),
        "paper_type": _pick(row, "Paper type"),
        "substrate_weight": _pick(row, "Substrate weight"),
        "wrap": _pick(row, "Wrap"),
        "edge": _pick(row, "Edge"),
    }

    variant_key = _build_variant_key(attributes)

    normalized_medium = _normalize_medium(product_type)
    normalized_presentation = _normalize_presentation(product_type)
    normalized_frame_type = _normalize_frame_type(
        product_type=product_type,
        frame=attributes["frame"],
        description=description,
    )

    normalized_material = None
    if normalized_medium == "paper":
        normalized_material = _paper_material_slug(attributes["paper_type"], description)
    elif normalized_medium == "canvas":
        normalized_material = _canvas_material_slug(attributes["paper_type"], description)

    source_country = _pick(row, "Source country")
    destination_country = _pick(row, "Destination country")
    shipping_method = _pick(row, "Shipping method")
    service_name = _pick(row, "ServiceName")
    service_level = _pick(row, "ServiceLevel")
    route_key = _build_route_key(
        sku=sku,
        variant_key=variant_key,
        source_country=source_country,
        destination_country=destination_country,
        shipping_method=shipping_method,
        service_name=service_name,
        service_level=service_level,
    )

    return {
        "sku": sku,
        "category": category,
        "product_type": product_type,
        "product_description": description,
        "size_cm": _pick(row, "Size (cm)"),
        "size_inches": _pick(row, "Size (inches)"),
        "finish": attributes["finish"],
        "color": attributes["color"],
        "frame": attributes["frame"],
        "style": attributes["style"],
        "glaze": attributes["glaze"],
        "mount": attributes["mount"],
        "mount_color": attributes["mount_color"],
        "paper_type": attributes["paper_type"],
        "substrate_weight": attributes["substrate_weight"],
        "wrap": attributes["wrap"],
        "edge": attributes["edge"],
        "raw_attributes": {k: v for k, v in attributes.items() if v is not None},
        "variant_key": variant_key,
        "normalized_medium": normalized_medium,
        "normalized_presentation": normalized_presentation,
        "normalized_frame_type": normalized_frame_type,
        "normalized_material": normalized_material,
        "is_relevant_for_artshop": _is_relevant_for_artshop(
            medium=normalized_medium,
            presentation=normalized_presentation,
            frame_type=normalized_frame_type,
            material=normalized_material,
            description=description,
            sku=sku,
        ),
        "source_country": source_country,
        "destination_country": destination_country,
        "destination_country_name": _pick(row, "Destination Country Name"),
        "region_id": _pick(row, "RegionId"),
        "shipping_method": shipping_method,
        "service_name": service_name,
        "service_level": service_level,
        "tracked_shipping": _pick(row, "Tracked shipping"),
        "product_price": _to_decimal(_pick(row, "Product price")),
        "product_currency": _pick(row, "Product currency"),
        "shipping_price": _to_decimal(_pick(row, "Shipping price", "ShippingRate")),
        "plus_one_shipping_price": _to_decimal(_pick(row, "Plus one shipping price")),
        "shipping_currency": _pick(row, "Shipping currency", "Currency"),
        "min_shipping_days": _to_int(_pick(row, "Minimum shipping (days)", "MinTransitDays")),
        "max_shipping_days": _to_int(_pick(row, "Maximum shipping (days)", "MaxTransitDays")),
        "route_key": route_key,
        "raw_row": row,
    }


CURATED_CSV_FIELDNAMES = [
    CURATED_VERSION_FIELD,
    "sku",
    "category",
    "product_type",
    "product_description",
    "size_cm",
    "size_inches",
    "finish",
    "color",
    "frame",
    "style",
    "glaze",
    "mount",
    "mount_color",
    "paper_type",
    "substrate_weight",
    "wrap",
    "edge",
    "raw_attributes_json",
    "variant_key",
    "normalized_medium",
    "normalized_presentation",
    "normalized_frame_type",
    "normalized_material",
    "is_relevant_for_artshop",
    "category_id",
    "source_country",
    "destination_country",
    "destination_country_name",
    "region_id",
    "shipping_method",
    "service_name",
    "service_level",
    "tracked_shipping",
    "product_price",
    "product_currency",
    "shipping_price",
    "plus_one_shipping_price",
    "shipping_currency",
    "min_shipping_days",
    "max_shipping_days",
    "route_key",
]


def curated_row_from_parsed(
    parsed: dict[str, Any],
    *,
    category_id: str | None = None,
) -> dict[str, Any]:
    row: dict[str, Any] = {}
    for field in CURATED_CSV_FIELDNAMES:
        if field == CURATED_VERSION_FIELD:
            row[field] = CURATED_VERSION
        elif field == "raw_attributes_json":
            row[field] = json.dumps(
                parsed.get("raw_attributes") or {},
                sort_keys=True,
                ensure_ascii=True,
                separators=(",", ":"),
            )
        elif field == "category_id":
            row[field] = category_id or parsed.get("category_id") or ""
        elif field == "is_relevant_for_artshop":
            row[field] = "true" if parsed.get("is_relevant_for_artshop") else "false"
        else:
            value = parsed.get(field)
            row[field] = "" if value is None else str(value)
    return row


def parse_curated_prodigi_csv_row(row: dict[str, Any]) -> dict[str, Any] | None:
    sku = _clean(row.get("sku"))
    if sku is None:
        return None
    raw_attributes_json = _clean(row.get("raw_attributes_json"))
    try:
        raw_attributes = json.loads(raw_attributes_json or "{}")
    except json.JSONDecodeError:
        raw_attributes = {}
    if not isinstance(raw_attributes, dict):
        raw_attributes = {}
    return {
        "sku": sku,
        "category": _clean(row.get("category")),
        "product_type": _clean(row.get("product_type")),
        "product_description": _clean(row.get("product_description")),
        "size_cm": _clean(row.get("size_cm")),
        "size_inches": _clean(row.get("size_inches")),
        "finish": _clean(row.get("finish")),
        "color": _clean(row.get("color")),
        "frame": _clean(row.get("frame")),
        "style": _clean(row.get("style")),
        "glaze": _clean(row.get("glaze")),
        "mount": _clean(row.get("mount")),
        "mount_color": _clean(row.get("mount_color")),
        "paper_type": _clean(row.get("paper_type")),
        "substrate_weight": _clean(row.get("substrate_weight")),
        "wrap": _clean(row.get("wrap")),
        "edge": _clean(row.get("edge")),
        "raw_attributes": raw_attributes,
        "variant_key": _clean(row.get("variant_key")) or "base",
        "normalized_medium": _clean(row.get("normalized_medium")),
        "normalized_presentation": _clean(row.get("normalized_presentation")),
        "normalized_frame_type": _clean(row.get("normalized_frame_type")),
        "normalized_material": _clean(row.get("normalized_material")),
        "is_relevant_for_artshop": _to_bool(row.get("is_relevant_for_artshop")),
        "category_id": _clean(row.get("category_id")),
        "source_country": _clean(row.get("source_country")),
        "destination_country": _clean(row.get("destination_country")),
        "destination_country_name": _clean(row.get("destination_country_name")),
        "region_id": _clean(row.get("region_id")),
        "shipping_method": _clean(row.get("shipping_method")),
        "service_name": _clean(row.get("service_name")),
        "service_level": _clean(row.get("service_level")),
        "tracked_shipping": _clean(row.get("tracked_shipping")),
        "product_price": _to_decimal(_clean(row.get("product_price"))),
        "product_currency": _clean(row.get("product_currency")),
        "shipping_price": _to_decimal(_clean(row.get("shipping_price"))),
        "plus_one_shipping_price": _to_decimal(_clean(row.get("plus_one_shipping_price"))),
        "shipping_currency": _clean(row.get("shipping_currency")),
        "min_shipping_days": _to_int(_clean(row.get("min_shipping_days"))),
        "max_shipping_days": _to_int(_clean(row.get("max_shipping_days"))),
        "route_key": _clean(row.get("route_key")) or sku,
    }


class ProdigiCsvRowParser:
    """Pure parser/normalizer for one Prodigi CSV row."""

    def parse(self, file_path: Path, row: dict[str, Any]) -> dict[str, Any] | None:
        return parse_prodigi_csv_row(file_path, row)
