"""
High-performance Prodigi catalog importer.

Strategy:
1. Stream-parse all supplier CSV files into a flat UNLOGGED staging table using
   PostgreSQL COPY in batches.
2. Build the normalized catalog tables via set-based INSERT ... SELECT.

This avoids ORM row-by-row inserts and keeps memory usage bounded.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import sys
import time
from decimal import InvalidOperation
from pathlib import Path

import psycopg2

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.config import settings


def _clean(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = str(value).strip().strip('"')
    return cleaned or None


def _pick(row: dict[str, str], *names: str) -> str | None:
    for name in names:
        value = _clean(row.get(name))
        if value is not None:
            return value
    return None


def _normalize_decimal(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip().replace(",", "")
    if not cleaned:
        return None
    try:
        float(cleaned)
        return cleaned
    except (ValueError, InvalidOperation):
        return None


def _normalize_int(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    try:
        return str(int(float(cleaned)))
    except ValueError:
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
    if "classic framed" in haystack and "canvas" in haystack:
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
) -> str:
    description_lower = (description or "").lower()
    sku_upper = (sku or "").upper()

    if medium == "paper" and presentation == "rolled":
        return "true"
    if medium == "paper" and frame_type == "box_frame":
        return "true"
    if medium == "canvas" and material == "metallic_canvas":
        return "false"
    if medium == "canvas" and presentation == "rolled":
        return "true"
    if medium == "canvas" and frame_type == "classic_frame":
        return "true"
    if medium == "canvas" and presentation == "stretched":
        return "false" if "19mm" in description_lower or "SLIMCAN" in sku_upper else "true"
    if medium == "canvas" and frame_type == "floating_frame":
        return "true"
    return "false"


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


def _csv_root() -> Path:
    return Path(__file__).resolve().parents[2] / "prodigy"


def _discover_files(max_files: int | None = None) -> list[Path]:
    files = sorted(_csv_root().rglob("*.csv"))
    if max_files is not None:
        files = files[:max_files]
    return files


def _connect():
    return psycopg2.connect(
        host=settings.DB_HOST,
        port=settings.DB_PORT,
        dbname=settings.POSTGRES_DB,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
    )


def _create_staging(cur) -> None:
    cur.execute(
        """
        DROP TABLE IF EXISTS prodigi_catalog_stage;
        CREATE UNLOGGED TABLE prodigi_catalog_stage (
            sku text,
            category text,
            product_type text,
            product_description text,
            size_cm text,
            size_inches text,
            finish text,
            color text,
            frame text,
            style text,
            glaze text,
            mount text,
            mount_color text,
            paper_type text,
            substrate_weight text,
            wrap text,
            edge text,
            raw_attributes jsonb,
            variant_key text,
            normalized_medium text,
            normalized_presentation text,
            normalized_frame_type text,
            normalized_material text,
            is_relevant_for_artshop boolean,
            source_country text,
            destination_country text,
            destination_country_name text,
            region_id text,
            shipping_method text,
            service_name text,
            service_level text,
            tracked_shipping text,
            product_price numeric(12, 2),
            product_currency text,
            shipping_price numeric(12, 2),
            plus_one_shipping_price numeric(12, 2),
            shipping_currency text,
            min_shipping_days integer,
            max_shipping_days integer,
            route_key text,
            source_csv_path text,
            raw_row jsonb
        );
        """
    )


def _truncate_final_tables(cur) -> None:
    cur.execute(
        """
        TRUNCATE TABLE prodigi_catalog_routes, prodigi_catalog_variants, prodigi_catalog_products
        RESTART IDENTITY CASCADE;
        """
    )


def _copy_batch(cur, rows: list[list[str | None]]) -> None:
    if not rows:
        return
    buf = io.StringIO()
    writer = csv.writer(buf, delimiter="\t", lineterminator="\n", quoting=csv.QUOTE_MINIMAL)
    writer.writerows(rows)
    buf.seek(0)
    cur.copy_expert(
        """
        COPY prodigi_catalog_stage (
            sku,
            category,
            product_type,
            product_description,
            size_cm,
            size_inches,
            finish,
            color,
            frame,
            style,
            glaze,
            mount,
            mount_color,
            paper_type,
            substrate_weight,
            wrap,
            edge,
            raw_attributes,
            variant_key,
            normalized_medium,
            normalized_presentation,
            normalized_frame_type,
            normalized_material,
            is_relevant_for_artshop,
            source_country,
            destination_country,
            destination_country_name,
            region_id,
            shipping_method,
            service_name,
            service_level,
            tracked_shipping,
            product_price,
            product_currency,
            shipping_price,
            plus_one_shipping_price,
            shipping_currency,
            min_shipping_days,
            max_shipping_days,
            route_key,
            source_csv_path,
            raw_row
        )
        FROM STDIN WITH (FORMAT csv, DELIMITER E'\t', NULL '\\N')
        """,
        buf,
    )


def _iter_stage_rows(files: list[Path], max_rows: int | None = None):
    csv_root = _csv_root()
    produced = 0
    for file_path in files:
        with file_path.open("r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                if max_rows is not None and produced >= max_rows:
                    return

                sku = _pick(row, "SKU")
                if sku is None:
                    continue

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

                produced += 1
                yield [
                    sku,
                    category,
                    product_type,
                    description,
                    _pick(row, "Size (cm)"),
                    _pick(row, "Size (inches)"),
                    attributes["finish"],
                    attributes["color"],
                    attributes["frame"],
                    attributes["style"],
                    attributes["glaze"],
                    attributes["mount"],
                    attributes["mount_color"],
                    attributes["paper_type"],
                    attributes["substrate_weight"],
                    attributes["wrap"],
                    attributes["edge"],
                    json.dumps({k: v for k, v in attributes.items() if v is not None}, ensure_ascii=True)
                    if any(attributes.values())
                    else None,
                    variant_key,
                    normalized_medium,
                    normalized_presentation,
                    normalized_frame_type,
                    normalized_material,
                    _is_relevant_for_artshop(
                        normalized_medium,
                        normalized_presentation,
                        normalized_frame_type,
                        normalized_material,
                        description,
                        sku,
                    ),
                    source_country,
                    destination_country,
                    _pick(row, "Destination Country Name"),
                    _pick(row, "RegionId"),
                    shipping_method,
                    service_name,
                    service_level,
                    _pick(row, "Tracked shipping"),
                    _normalize_decimal(_pick(row, "Product price")),
                    _pick(row, "Product currency"),
                    _normalize_decimal(_pick(row, "Shipping price", "ShippingRate")),
                    _normalize_decimal(_pick(row, "Plus one shipping price")),
                    _pick(row, "Shipping currency", "Currency"),
                    _normalize_int(_pick(row, "Minimum shipping (days)", "MinTransitDays")),
                    _normalize_int(_pick(row, "Maximum shipping (days)", "MaxTransitDays")),
                    route_key,
                    str(file_path.relative_to(csv_root.parent)),
                    json.dumps(row, ensure_ascii=True),
                ]


def _load_stage(cur, files: list[Path], batch_size: int, max_rows: int | None) -> tuple[int, int]:
    rows_seen = 0
    batch: list[list[str | None]] = []
    start = time.perf_counter()
    for stage_row in _iter_stage_rows(files, max_rows=max_rows):
        batch.append([value if value is not None else "\\N" for value in stage_row])
        rows_seen += 1
        if len(batch) >= batch_size:
            _copy_batch(cur, batch)
            batch.clear()
            if rows_seen % (batch_size * 5) == 0:
                elapsed = time.perf_counter() - start
                print(f"staging rows={rows_seen} elapsed={elapsed:.1f}s")
    if batch:
        _copy_batch(cur, batch)
    return rows_seen, len(files)


def _materialize_final_tables(cur) -> None:
    cur.execute(
        """
        INSERT INTO prodigi_catalog_products (
            sku, category, product_type, product_description, size_cm, size_inches
        )
        SELECT DISTINCT ON (sku)
            sku, category, product_type, product_description, size_cm, size_inches
        FROM prodigi_catalog_stage
        ORDER BY sku;
        """
    )

    cur.execute(
        """
        INSERT INTO prodigi_catalog_variants (
            product_id,
            variant_key,
            finish,
            color,
            frame,
            style,
            glaze,
            mount,
            mount_color,
            paper_type,
            substrate_weight,
            wrap,
            edge,
            raw_attributes,
            normalized_medium,
            normalized_presentation,
            normalized_frame_type,
            normalized_material,
            is_relevant_for_artshop
        )
        SELECT DISTINCT ON (s.sku, s.variant_key)
            p.id,
            s.variant_key,
            s.finish,
            s.color,
            s.frame,
            s.style,
            s.glaze,
            s.mount,
            s.mount_color,
            s.paper_type,
            s.substrate_weight,
            s.wrap,
            s.edge,
            s.raw_attributes,
            s.normalized_medium,
            s.normalized_presentation,
            s.normalized_frame_type,
            s.normalized_material,
            s.is_relevant_for_artshop
        FROM prodigi_catalog_stage s
        JOIN prodigi_catalog_products p ON p.sku = s.sku
        ORDER BY s.sku, s.variant_key;
        """
    )

    cur.execute(
        """
        INSERT INTO prodigi_catalog_routes (
            variant_id,
            route_key,
            source_country,
            destination_country,
            destination_country_name,
            region_id,
            shipping_method,
            service_name,
            service_level,
            tracked_shipping,
            product_price,
            product_currency,
            shipping_price,
            plus_one_shipping_price,
            shipping_currency,
            min_shipping_days,
            max_shipping_days,
            source_csv_path,
            raw_row
        )
        SELECT DISTINCT ON (s.route_key)
            v.id,
            s.route_key,
            s.source_country,
            s.destination_country,
            s.destination_country_name,
            s.region_id,
            s.shipping_method,
            s.service_name,
            s.service_level,
            s.tracked_shipping,
            s.product_price,
            s.product_currency,
            s.shipping_price,
            s.plus_one_shipping_price,
            s.shipping_currency,
            s.min_shipping_days,
            s.max_shipping_days,
            s.source_csv_path,
            s.raw_row
        FROM prodigi_catalog_stage s
        JOIN prodigi_catalog_products p ON p.sku = s.sku
        JOIN prodigi_catalog_variants v
          ON v.product_id = p.id
         AND v.variant_key = s.variant_key
        ORDER BY s.route_key;
        """
    )


def _print_counts(cur) -> None:
    for table in (
        "prodigi_catalog_products",
        "prodigi_catalog_variants",
        "prodigi_catalog_routes",
    ):
        cur.execute(f"SELECT count(*) FROM {table}")
        print(f"{table}: {cur.fetchone()[0]}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Fast import of Prodigi CSV catalog into PostgreSQL")
    parser.add_argument("--max-files", type=int, default=None)
    parser.add_argument("--max-rows", type=int, default=None)
    parser.add_argument("--batch-size", type=int, default=50000)
    args = parser.parse_args()

    files = _discover_files(max_files=args.max_files)
    if not files:
        raise SystemExit("No CSV files found under prodigy/")

    t0 = time.perf_counter()
    conn = _connect()
    conn.autocommit = False
    try:
        with conn.cursor() as cur:
            _truncate_final_tables(cur)
            _create_staging(cur)
            conn.commit()

            rows_seen, files_seen = _load_stage(
                cur,
                files=files,
                batch_size=args.batch_size,
                max_rows=args.max_rows,
            )
            conn.commit()
            print(f"staging loaded rows={rows_seen} files={files_seen}")

            sql_start = time.perf_counter()
            _materialize_final_tables(cur)
            conn.commit()
            print(f"final tables materialized in {time.perf_counter() - sql_start:.1f}s")

            _print_counts(cur)
            cur.execute("DROP TABLE IF EXISTS prodigi_catalog_stage")
            conn.commit()
    finally:
        conn.close()

    print(f"total elapsed: {time.perf_counter() - t0:.1f}s")


if __name__ == "__main__":
    main()
