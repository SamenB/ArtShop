"""
Importer for the local Prodigi CSV catalog dump.

This importer is intentionally split into two conceptual layers:
1. Preserve the supplier catalog without losing route-level detail.
2. Derive normalized fields that make storefront filtering manageable later.
"""

from __future__ import annotations

import csv
import json
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

from loguru import logger
from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from src.database import new_session_null_pool
from src.models.prodigi_catalog import (
    ProdigiCatalogProductOrm,
    ProdigiCatalogRouteOrm,
    ProdigiCatalogVariantOrm,
)


def _clean(value: str | None) -> str | None:
    """Trim strings and collapse empty values to None."""
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
    if "print" in value:
        return "paper"
    if "canvas" in value:
        return "canvas"
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


@dataclass(slots=True)
class ImportStats:
    files_seen: int = 0
    rows_seen: int = 0
    products_created: int = 0
    variants_created: int = 0
    routes_created: int = 0


def _chunked(items: list[dict[str, Any]], size: int) -> list[list[dict[str, Any]]]:
    return [items[i : i + size] for i in range(0, len(items), size)]


class ProdigiCsvImportService:
    """Imports local Prodigi CSV files into normalized catalog tables."""

    def __init__(self, csv_root: Path | None = None):
        self.csv_root = csv_root or Path(__file__).resolve().parents[3] / "prodigy"

    def discover_csv_files(self) -> list[Path]:
        return sorted(self.csv_root.rglob("*.csv"))

    async def import_catalog(
        self,
        reset: bool = True,
        dry_run: bool = False,
        max_files: int | None = None,
        max_rows: int | None = None,
        commit_every: int = 5000,
        log_every: int = 5000,
    ) -> ImportStats:
        stats = ImportStats()
        files = self.discover_csv_files()
        if max_files is not None:
            files = files[:max_files]
        stats.files_seen = len(files)

        if not files:
            raise FileNotFoundError(f"No Prodigi CSV files found under {self.csv_root}")

        logger.info("Prodigi import starting. files={} dry_run={}", len(files), dry_run)

        product_records: dict[str, dict[str, Any]] = {}
        variant_records: dict[tuple[str, str], dict[str, Any]] = {}
        route_records: dict[str, dict[str, Any]] = {}

        for file_path in files:
            with file_path.open("r", encoding="utf-8-sig", newline="") as handle:
                reader = csv.DictReader(handle)
                for row in reader:
                    if max_rows is not None and stats.rows_seen >= max_rows:
                        logger.info("Prodigi parse stopped early at max_rows={}", max_rows)
                        break

                    stats.rows_seen += 1
                    parsed = self._parse_row(file_path, row)
                    if not parsed:
                        continue

                    sku = parsed["sku"]
                    variant_key = parsed["variant_key"]
                    route_key = parsed["route_key"]

                    product_records.setdefault(
                        sku,
                        {
                            "sku": sku,
                            "category": parsed["category"],
                            "product_type": parsed["product_type"],
                            "product_description": parsed["product_description"],
                            "size_cm": parsed["size_cm"],
                            "size_inches": parsed["size_inches"],
                        },
                    )

                    variant_records.setdefault(
                        (sku, variant_key),
                        {
                            "sku": sku,
                            "variant_key": variant_key,
                            "finish": parsed["finish"],
                            "color": parsed["color"],
                            "frame": parsed["frame"],
                            "style": parsed["style"],
                            "glaze": parsed["glaze"],
                            "mount": parsed["mount"],
                            "mount_color": parsed["mount_color"],
                            "paper_type": parsed["paper_type"],
                            "substrate_weight": parsed["substrate_weight"],
                            "wrap": parsed["wrap"],
                            "edge": parsed["edge"],
                            "raw_attributes": parsed["raw_attributes"],
                            "normalized_medium": parsed["normalized_medium"],
                            "normalized_presentation": parsed["normalized_presentation"],
                            "normalized_frame_type": parsed["normalized_frame_type"],
                            "normalized_material": parsed["normalized_material"],
                            "is_relevant_for_artshop": parsed["is_relevant_for_artshop"],
                        },
                    )

                    route_records.setdefault(
                        route_key,
                        {
                            "sku": sku,
                            "variant_key": variant_key,
                            "route_key": route_key,
                            "source_country": parsed["source_country"],
                            "destination_country": parsed["destination_country"],
                            "destination_country_name": parsed["destination_country_name"],
                            "region_id": parsed["region_id"],
                            "shipping_method": parsed["shipping_method"],
                            "service_name": parsed["service_name"],
                            "service_level": parsed["service_level"],
                            "tracked_shipping": parsed["tracked_shipping"],
                            "product_price": parsed["product_price"],
                            "product_currency": parsed["product_currency"],
                            "shipping_price": parsed["shipping_price"],
                            "plus_one_shipping_price": parsed["plus_one_shipping_price"],
                            "shipping_currency": parsed["shipping_currency"],
                            "min_shipping_days": parsed["min_shipping_days"],
                            "max_shipping_days": parsed["max_shipping_days"],
                            "source_csv_path": str(file_path.relative_to(self.csv_root.parent)),
                            "raw_row": parsed["raw_row"],
                        },
                    )

                    if stats.rows_seen % log_every == 0:
                        logger.info(
                            "Prodigi parse progress rows={} products={} variants={} routes={}",
                            stats.rows_seen,
                            len(product_records),
                            len(variant_records),
                            len(route_records),
                        )

                if max_rows is not None and stats.rows_seen >= max_rows:
                    break

        stats.products_created = len(product_records)
        stats.variants_created = len(variant_records)
        stats.routes_created = len(route_records)

        if dry_run:
            logger.info(
                "Prodigi dry-run complete. products={} variants={} routes={} rows={}",
                stats.products_created,
                stats.variants_created,
                stats.routes_created,
                stats.rows_seen,
            )
            return stats

        async with new_session_null_pool() as session:
            if reset:
                await session.execute(delete(ProdigiCatalogRouteOrm))
                await session.execute(delete(ProdigiCatalogVariantOrm))
                await session.execute(delete(ProdigiCatalogProductOrm))
                await session.commit()
            product_rows = list(product_records.values())
            for idx, chunk in enumerate(_chunked(product_rows, commit_every), start=1):
                stmt = pg_insert(ProdigiCatalogProductOrm).values(chunk)
                stmt = stmt.on_conflict_do_nothing(index_elements=["sku"])
                await session.execute(stmt)
                await session.commit()
                logger.info("Inserted product chunks {}/{}", idx, max(1, len(product_rows) // commit_every + 1))

            product_id_rows = await session.execute(
                select(ProdigiCatalogProductOrm.id, ProdigiCatalogProductOrm.sku)
            )
            product_id_map = {sku: pid for pid, sku in product_id_rows.all()}

            variant_rows_to_insert: list[dict[str, Any]] = []
            for record in variant_records.values():
                variant_rows_to_insert.append(
                    {
                        "product_id": product_id_map[record["sku"]],
                        "variant_key": record["variant_key"],
                        "finish": record["finish"],
                        "color": record["color"],
                        "frame": record["frame"],
                        "style": record["style"],
                        "glaze": record["glaze"],
                        "mount": record["mount"],
                        "mount_color": record["mount_color"],
                        "paper_type": record["paper_type"],
                        "substrate_weight": record["substrate_weight"],
                        "wrap": record["wrap"],
                        "edge": record["edge"],
                        "raw_attributes": record["raw_attributes"],
                        "normalized_medium": record["normalized_medium"],
                        "normalized_presentation": record["normalized_presentation"],
                        "normalized_frame_type": record["normalized_frame_type"],
                        "normalized_material": record["normalized_material"],
                        "is_relevant_for_artshop": record["is_relevant_for_artshop"],
                    }
                )

            for idx, chunk in enumerate(_chunked(variant_rows_to_insert, commit_every), start=1):
                stmt = pg_insert(ProdigiCatalogVariantOrm).values(chunk)
                stmt = stmt.on_conflict_do_nothing(
                    constraint="uq_prodigi_variant_product_key"
                )
                await session.execute(stmt)
                await session.commit()
                logger.info(
                    "Inserted variant chunks {}/{}",
                    idx,
                    max(1, len(variant_rows_to_insert) // commit_every + 1),
                )

            variant_id_rows = await session.execute(
                select(
                    ProdigiCatalogVariantOrm.id,
                    ProdigiCatalogVariantOrm.variant_key,
                    ProdigiCatalogProductOrm.sku,
                ).join(
                    ProdigiCatalogProductOrm,
                    ProdigiCatalogVariantOrm.product_id == ProdigiCatalogProductOrm.id,
                )
            )
            variant_id_map = {
                (sku, variant_key): variant_id
                for variant_id, variant_key, sku in variant_id_rows.all()
            }

            route_rows_to_insert: list[dict[str, Any]] = []
            for record in route_records.values():
                route_rows_to_insert.append(
                    {
                        "variant_id": variant_id_map[(record["sku"], record["variant_key"])],
                        "route_key": record["route_key"],
                        "source_country": record["source_country"],
                        "destination_country": record["destination_country"],
                        "destination_country_name": record["destination_country_name"],
                        "region_id": record["region_id"],
                        "shipping_method": record["shipping_method"],
                        "service_name": record["service_name"],
                        "service_level": record["service_level"],
                        "tracked_shipping": record["tracked_shipping"],
                        "product_price": record["product_price"],
                        "product_currency": record["product_currency"],
                        "shipping_price": record["shipping_price"],
                        "plus_one_shipping_price": record["plus_one_shipping_price"],
                        "shipping_currency": record["shipping_currency"],
                        "min_shipping_days": record["min_shipping_days"],
                        "max_shipping_days": record["max_shipping_days"],
                        "source_csv_path": record["source_csv_path"],
                        "raw_row": record["raw_row"],
                    }
                )

            for idx, chunk in enumerate(_chunked(route_rows_to_insert, commit_every), start=1):
                stmt = pg_insert(ProdigiCatalogRouteOrm).values(chunk)
                stmt = stmt.on_conflict_do_nothing(index_elements=["route_key"])
                await session.execute(stmt)
                await session.commit()
                logger.info(
                    "Inserted route chunks {}/{}",
                    idx,
                    max(1, len(route_rows_to_insert) // commit_every + 1),
                )

        logger.info(
            "Prodigi import complete. products={} variants={} routes={} rows={}",
            stats.products_created,
            stats.variants_created,
            stats.routes_created,
            stats.rows_seen,
        )
        return stats

    def _parse_row(self, file_path: Path, row: dict[str, Any]) -> dict[str, Any] | None:
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

    async def summarize_import(self) -> dict[str, int]:
        async with new_session_null_pool() as session:
            products = await session.scalar(select(func.count()).select_from(ProdigiCatalogProductOrm))
            variants = await session.scalar(select(func.count()).select_from(ProdigiCatalogVariantOrm))
            routes = await session.scalar(select(func.count()).select_from(ProdigiCatalogRouteOrm))
        return {
            "products": products or 0,
            "variants": variants or 0,
            "routes": routes or 0,
        }
