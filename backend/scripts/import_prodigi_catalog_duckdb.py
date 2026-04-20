"""
DuckDB-powered Prodigi catalog importer.

Why this script exists:
- Python row-by-row CSV parsing is too slow for the full Prodigi dump.
- PostgreSQL staging tables caused disk bloat inside Docker/WSL.

This importer uses DuckDB as a fast local analytical engine on the host side:
1. Read CSV files into a local temporary DuckDB database.
2. Normalize and deduplicate with SQL.
3. Export compact final datasets to temp CSV files.
4. COPY final datasets into PostgreSQL.
"""

from __future__ import annotations

import argparse
import shutil
import sys
import tempfile
import time
from pathlib import Path

import duckdb
import psycopg2

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.config import settings


def _connect_pg():
    return psycopg2.connect(
        host=settings.DB_HOST,
        port=settings.DB_PORT,
        dbname=settings.POSTGRES_DB,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
    )


def _csv_root() -> Path:
    return Path(__file__).resolve().parents[2] / "prodigy"


def _discover_files(max_files: int | None = None) -> list[Path]:
    files = sorted(_csv_root().rglob("*.csv"))
    if max_files is not None:
        files = files[:max_files]
    return files


def _render_progress(prefix: str, done_bytes: int, total_bytes: int, start_ts: float) -> None:
    percent = (done_bytes / total_bytes * 100) if total_bytes else 100.0
    elapsed = time.perf_counter() - start_ts
    speed_mb = (done_bytes / 1024 / 1024 / elapsed) if elapsed > 0 else 0.0
    width = 28
    filled = int(width * percent / 100)
    bar = "#" * filled + "-" * (width - filled)
    print(
        f"\r{prefix} [{bar}] {percent:6.2f}%  "
        f"{done_bytes / 1024 / 1024:8.1f}/{total_bytes / 1024 / 1024:8.1f} MB  "
        f"{speed_mb:7.1f} MB/s",
        end="",
        flush=True,
    )


def _quote_sql(path: Path) -> str:
    return str(path).replace("\\", "/").replace("'", "''")


def _copy_file(cur, table: str, columns: tuple[str, ...], path: Path) -> None:
    with path.open("r", encoding="utf-8", newline="") as handle:
        cur.copy_from(handle, table, sep="\t", null="\\N", columns=columns)


def _truncate_pg(cur) -> None:
    cur.execute(
        """
        TRUNCATE TABLE prodigi_catalog_routes, prodigi_catalog_variants, prodigi_catalog_products
        RESTART IDENTITY CASCADE;
        """
    )


def _prepare_duckdb(con: duckdb.DuckDBPyConnection) -> None:
    con.execute(
        """
        CREATE TABLE raw_prodigi (
            source_file VARCHAR,
            Category VARCHAR,
            "Product type" VARCHAR,
            SKU VARCHAR,
            "Product description" VARCHAR,
            "Size (cm)" VARCHAR,
            "Size (inches)" VARCHAR,
            Finish VARCHAR,
            Color VARCHAR,
            Frame VARCHAR,
            Style VARCHAR,
            Glaze VARCHAR,
            Mount VARCHAR,
            "Mount color" VARCHAR,
            "Paper type" VARCHAR,
            "Substrate weight" VARCHAR,
            Wrap VARCHAR,
            Edge VARCHAR,
            "Product price" VARCHAR,
            "Product currency" VARCHAR,
            "Source country" VARCHAR,
            "Destination country" VARCHAR,
            "Destination Country Name" VARCHAR,
            RegionId VARCHAR,
            "Shipping method" VARCHAR,
            "Shipping price" VARCHAR,
            "Plus one shipping price" VARCHAR,
            "Shipping currency" VARCHAR,
            "Minimum shipping (days)" VARCHAR,
            "Maximum shipping (days)" VARCHAR,
            "Tracked shipping" VARCHAR,
            ServiceName VARCHAR,
            ServiceLevel VARCHAR,
            MinTransitDays VARCHAR,
            MaxTransitDays VARCHAR,
            ShippingRate VARCHAR,
            Currency VARCHAR
        );
        """
    )


def _ingest_files(
    con: duckdb.DuckDBPyConnection,
    files: list[Path],
    max_rows: int | None,
) -> None:
    total_bytes = sum(path.stat().st_size for path in files)
    processed_bytes = 0
    start_ts = time.perf_counter()

    rows_left = max_rows
    for file_path in files:
        if rows_left is not None and rows_left <= 0:
            break

        limit_clause = f"LIMIT {rows_left}" if rows_left is not None else ""
        file_sql = _quote_sql(file_path)
        con.execute(
            f"""
            INSERT INTO raw_prodigi BY NAME
            SELECT
                filename AS source_file,
                * EXCLUDE (filename)
            FROM read_csv_auto(
                '{file_sql}',
                header = true,
                all_varchar = true,
                union_by_name = true,
                filename = true,
                ignore_errors = false
            )
            {limit_clause}
            """
        )
        if rows_left is not None:
            inserted = con.execute("SELECT count(*) FROM raw_prodigi").fetchone()[0]
            rows_left = max_rows - inserted

        processed_bytes += file_path.stat().st_size
        _render_progress("DuckDB load", processed_bytes, total_bytes, start_ts)

    print()


def _build_normalized_tables(con: duckdb.DuckDBPyConnection) -> None:
    con.execute(
        """
        CREATE TABLE products_final AS
        SELECT
            row_number() OVER (ORDER BY sku) AS id,
            sku,
            category,
            product_type,
            product_description,
            size_cm,
            size_inches
        FROM (
            SELECT DISTINCT ON (sku)
                trim(SKU) AS sku,
                NULLIF(trim(Category), '') AS category,
                NULLIF(trim("Product type"), '') AS product_type,
                NULLIF(trim("Product description"), '') AS product_description,
                NULLIF(trim("Size (cm)"), '') AS size_cm,
                NULLIF(trim("Size (inches)"), '') AS size_inches
            FROM raw_prodigi
            WHERE NULLIF(trim(SKU), '') IS NOT NULL
            ORDER BY sku
        ) p;
        """
    )

    con.execute(
        """
        CREATE TABLE variants_final AS
        WITH base AS (
            SELECT
                trim(SKU) AS sku,
                NULLIF(trim(Finish), '') AS finish,
                NULLIF(trim(Color), '') AS color,
                NULLIF(trim(Frame), '') AS frame,
                NULLIF(trim(Style), '') AS style,
                NULLIF(trim(Glaze), '') AS glaze,
                NULLIF(trim(Mount), '') AS mount,
                NULLIF(trim("Mount color"), '') AS mount_color,
                NULLIF(trim("Paper type"), '') AS paper_type,
                NULLIF(trim("Substrate weight"), '') AS substrate_weight,
                NULLIF(trim(Wrap), '') AS wrap,
                NULLIF(trim(Edge), '') AS edge,
                NULLIF(trim("Product description"), '') AS product_description,
                NULLIF(trim("Product type"), '') AS product_type
            FROM raw_prodigi
            WHERE NULLIF(trim(SKU), '') IS NOT NULL
        ),
        attrs AS (
            SELECT
                *,
                CAST(to_json(map_from_entries(list_filter([
                    CASE WHEN finish IS NOT NULL THEN struct_pack(k := 'finish', v := finish) END,
                    CASE WHEN color IS NOT NULL THEN struct_pack(k := 'color', v := color) END,
                    CASE WHEN frame IS NOT NULL THEN struct_pack(k := 'frame', v := frame) END,
                    CASE WHEN style IS NOT NULL THEN struct_pack(k := 'style', v := style) END,
                    CASE WHEN glaze IS NOT NULL THEN struct_pack(k := 'glaze', v := glaze) END,
                    CASE WHEN mount IS NOT NULL THEN struct_pack(k := 'mount', v := mount) END,
                    CASE WHEN mount_color IS NOT NULL THEN struct_pack(k := 'mount_color', v := mount_color) END,
                    CASE WHEN paper_type IS NOT NULL THEN struct_pack(k := 'paper_type', v := paper_type) END,
                    CASE WHEN substrate_weight IS NOT NULL THEN struct_pack(k := 'substrate_weight', v := substrate_weight) END,
                    CASE WHEN wrap IS NOT NULL THEN struct_pack(k := 'wrap', v := wrap) END,
                    CASE WHEN edge IS NOT NULL THEN struct_pack(k := 'edge', v := edge) END
                ], x -> x IS NOT NULL))::MAP(VARCHAR, VARCHAR)) AS VARCHAR) AS variant_key
            FROM base
        ),
        variant_distinct AS (
            SELECT DISTINCT ON (sku, variant_key)
                sku,
                CASE WHEN variant_key = '{}' THEN 'base' ELSE variant_key END AS variant_key,
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
                CASE
                    WHEN lower(coalesce(product_type, '')) LIKE '%print%' THEN 'paper'
                    WHEN lower(coalesce(product_type, '')) LIKE '%canvas%' THEN 'canvas'
                    ELSE NULL
                END AS normalized_medium,
                CASE
                    WHEN lower(coalesce(product_type, '')) LIKE '%art prints%' THEN 'rolled'
                    WHEN lower(coalesce(product_type, '')) LIKE '%rolled canvas%' THEN 'rolled'
                    WHEN lower(coalesce(product_type, '')) LIKE '%stretched canvas%' THEN 'stretched'
                    WHEN lower(coalesce(product_type, '')) LIKE '%framed%' THEN 'framed'
                    ELSE NULL
                END AS normalized_presentation,
                CASE
                    WHEN lower(coalesce(product_type, '') || ' ' || coalesce(frame, '') || ' ' || coalesce(product_description, '')) LIKE '%float frame%'
                      OR lower(coalesce(product_type, '') || ' ' || coalesce(frame, '') || ' ' || coalesce(product_description, '')) LIKE '%float framed%'
                        THEN 'floating_frame'
                    WHEN lower(coalesce(product_type, '') || ' ' || coalesce(frame, '') || ' ' || coalesce(product_description, '')) LIKE '%box frame%'
                      OR frame = 'Box'
                        THEN 'box_frame'
                    WHEN lower(coalesce(product_type, '') || ' ' || coalesce(frame, '') || ' ' || coalesce(product_description, '')) LIKE '%classic framed%'
                      AND lower(coalesce(product_type, '') || ' ' || coalesce(frame, '') || ' ' || coalesce(product_description, '')) LIKE '%canvas%'
                        THEN 'classic_frame'
                    WHEN lower(coalesce(product_type, '') || ' ' || coalesce(frame, '') || ' ' || coalesce(product_description, '')) LIKE '%stretched canvas%'
                        THEN 'stretched_canvas'
                    WHEN lower(coalesce(product_type, '') || ' ' || coalesce(frame, '') || ' ' || coalesce(product_description, '')) LIKE '%rolled%'
                      OR lower(coalesce(product_type, '') || ' ' || coalesce(frame, '') || ' ' || coalesce(product_description, '')) LIKE '%no frame%'
                        THEN 'no_frame'
                    ELSE NULL
                END AS normalized_frame_type,
                CASE
                    WHEN lower(coalesce(product_type, '')) LIKE '%print%' THEN
                        CASE
                            WHEN lower(coalesce(paper_type, '') || ' ' || coalesce(product_description, '')) LIKE '%photo rag%'
                              OR lower(coalesce(paper_type, '') || ' ' || coalesce(product_description, '')) LIKE '%hpr%'
                                THEN 'hahnemuhle_photo_rag'
                            WHEN lower(coalesce(paper_type, '') || ' ' || coalesce(product_description, '')) LIKE '%german etching%'
                              OR lower(coalesce(paper_type, '') || ' ' || coalesce(product_description, '')) LIKE '%hge%'
                                THEN 'hahnemuhle_german_etching'
                            WHEN lower(coalesce(paper_type, '') || ' ' || coalesce(product_description, '')) LIKE '%baryta%'
                              OR lower(coalesce(paper_type, '') || ' ' || coalesce(product_description, '')) LIKE '%bap%'
                                THEN 'baryta_art_paper'
                            WHEN lower(coalesce(paper_type, '') || ' ' || coalesce(product_description, '')) LIKE '%smooth art paper%'
                              OR lower(coalesce(paper_type, '') || ' ' || coalesce(product_description, '')) LIKE '%sap%'
                                THEN 'smooth_art_paper'
                            WHEN lower(coalesce(paper_type, '') || ' ' || coalesce(product_description, '')) LIKE '%enhanced matte%'
                              OR lower(coalesce(paper_type, '') || ' ' || coalesce(product_description, '')) LIKE '%ema%'
                                THEN 'enhanced_matte_art_paper'
                            WHEN lower(coalesce(paper_type, '') || ' ' || coalesce(product_description, '')) LIKE '%cold press watercolour%'
                              OR lower(coalesce(paper_type, '') || ' ' || coalesce(product_description, '')) LIKE '%cpwp%'
                                THEN 'cold_press_watercolour_paper'
                            ELSE NULL
                        END
                    WHEN lower(coalesce(product_type, '')) LIKE '%canvas%' THEN
                        CASE
                            WHEN lower(coalesce(paper_type, '') || ' ' || coalesce(product_description, '')) LIKE '%pro canvas%'
                              OR lower(coalesce(paper_type, '') || ' ' || coalesce(product_description, '')) LIKE '%(pc)%'
                                THEN 'pro_canvas'
                            WHEN lower(coalesce(paper_type, '') || ' ' || coalesce(product_description, '')) LIKE '%standard canvas%'
                              OR lower(coalesce(paper_type, '') || ' ' || coalesce(product_description, '')) LIKE '%(sc)%'
                                THEN 'standard_canvas'
                            WHEN lower(coalesce(paper_type, '') || ' ' || coalesce(product_description, '')) LIKE '%metallic canvas%'
                              OR lower(coalesce(paper_type, '') || ' ' || coalesce(product_description, '')) LIKE '%(mc)%'
                                THEN 'metallic_canvas'
                            WHEN lower(coalesce(paper_type, '') || ' ' || coalesce(product_description, '')) LIKE '%cotton canvas%'
                              OR lower(coalesce(paper_type, '') || ' ' || coalesce(product_description, '')) LIKE '%(cc)%'
                                THEN 'cotton_canvas'
                            ELSE NULL
                        END
                    ELSE NULL
                END AS normalized_material,
                CASE
                    WHEN lower(coalesce(product_type, '')) LIKE '%print%' AND lower(coalesce(product_type, '')) LIKE '%art prints%' THEN TRUE
                    WHEN lower(coalesce(product_type, '')) LIKE '%print%' AND (
                        lower(coalesce(product_type, '') || ' ' || coalesce(frame, '') || ' ' || coalesce(product_description, '')) LIKE '%box frame%'
                        OR frame = 'Box'
                    ) THEN TRUE
                    WHEN lower(coalesce(product_type, '')) LIKE '%canvas%' AND (
                        lower(coalesce(product_type, '') || ' ' || coalesce(frame, '') || ' ' || coalesce(product_description, '')) LIKE '%float frame%'
                        OR lower(coalesce(product_type, '') || ' ' || coalesce(frame, '') || ' ' || coalesce(product_description, '')) LIKE '%float framed%'
                    ) AND NOT (
                        lower(coalesce(paper_type, '') || ' ' || coalesce(product_description, '')) LIKE '%metallic canvas%'
                        OR lower(coalesce(paper_type, '') || ' ' || coalesce(product_description, '')) LIKE '%(mc)%'
                    ) THEN TRUE
                    WHEN lower(coalesce(product_type, '')) LIKE '%canvas%' AND
                         lower(coalesce(product_type, '') || ' ' || coalesce(frame, '') || ' ' || coalesce(product_description, '')) LIKE '%classic framed%'
                        THEN TRUE
                    WHEN lower(coalesce(product_type, '')) LIKE '%canvas%' AND lower(coalesce(product_type, '')) LIKE '%rolled canvas%' AND NOT (
                        lower(coalesce(paper_type, '') || ' ' || coalesce(product_description, '')) LIKE '%metallic canvas%'
                        OR lower(coalesce(paper_type, '') || ' ' || coalesce(product_description, '')) LIKE '%(mc)%'
                    ) THEN TRUE
                    WHEN lower(coalesce(product_type, '')) LIKE '%canvas%' AND lower(coalesce(product_type, '')) LIKE '%stretched canvas%'
                      AND lower(coalesce(product_description, '')) NOT LIKE '%19mm%'
                      AND upper(coalesce(sku, '')) NOT LIKE '%SLIMCAN%'
                      AND NOT (
                        lower(coalesce(paper_type, '') || ' ' || coalesce(product_description, '')) LIKE '%metallic canvas%'
                        OR lower(coalesce(paper_type, '') || ' ' || coalesce(product_description, '')) LIKE '%(mc)%'
                    ) THEN TRUE
                    ELSE FALSE
                END AS is_relevant_for_artshop
            FROM attrs
            ORDER BY sku, variant_key
        )
        SELECT
            row_number() OVER (ORDER BY vd.sku, vd.variant_key) AS id,
            p.id AS product_id,
            vd.sku,
            vd.variant_key,
            vd.finish,
            vd.color,
            vd.frame,
            vd.style,
            vd.glaze,
            vd.mount,
            vd.mount_color,
            vd.paper_type,
            vd.substrate_weight,
            vd.wrap,
            vd.edge,
            vd.normalized_medium,
            vd.normalized_presentation,
            vd.normalized_frame_type,
            vd.normalized_material,
            vd.is_relevant_for_artshop
        FROM variant_distinct vd
        JOIN products_final p ON p.sku = vd.sku;
        """
    )

    con.execute(
        """
        CREATE TABLE routes_final AS
        WITH route_base AS (
            SELECT
                trim(SKU) AS sku,
                CASE
                    WHEN CAST(to_json(map_from_entries(list_filter([
                        CASE WHEN NULLIF(trim(Finish), '') IS NOT NULL THEN struct_pack(k := 'finish', v := NULLIF(trim(Finish), '')) END,
                        CASE WHEN NULLIF(trim(Color), '') IS NOT NULL THEN struct_pack(k := 'color', v := NULLIF(trim(Color), '')) END,
                        CASE WHEN NULLIF(trim(Frame), '') IS NOT NULL THEN struct_pack(k := 'frame', v := NULLIF(trim(Frame), '')) END,
                        CASE WHEN NULLIF(trim(Style), '') IS NOT NULL THEN struct_pack(k := 'style', v := NULLIF(trim(Style), '')) END,
                        CASE WHEN NULLIF(trim(Glaze), '') IS NOT NULL THEN struct_pack(k := 'glaze', v := NULLIF(trim(Glaze), '')) END,
                        CASE WHEN NULLIF(trim(Mount), '') IS NOT NULL THEN struct_pack(k := 'mount', v := NULLIF(trim(Mount), '')) END,
                        CASE WHEN NULLIF(trim("Mount color"), '') IS NOT NULL THEN struct_pack(k := 'mount_color', v := NULLIF(trim("Mount color"), '')) END,
                        CASE WHEN NULLIF(trim("Paper type"), '') IS NOT NULL THEN struct_pack(k := 'paper_type', v := NULLIF(trim("Paper type"), '')) END,
                        CASE WHEN NULLIF(trim("Substrate weight"), '') IS NOT NULL THEN struct_pack(k := 'substrate_weight', v := NULLIF(trim("Substrate weight"), '')) END,
                        CASE WHEN NULLIF(trim(Wrap), '') IS NOT NULL THEN struct_pack(k := 'wrap', v := NULLIF(trim(Wrap), '')) END,
                        CASE WHEN NULLIF(trim(Edge), '') IS NOT NULL THEN struct_pack(k := 'edge', v := NULLIF(trim(Edge), '')) END
                    ], x -> x IS NOT NULL))::MAP(VARCHAR, VARCHAR)) AS VARCHAR) = '{}' THEN 'base'
                    ELSE CAST(to_json(map_from_entries(list_filter([
                        CASE WHEN NULLIF(trim(Finish), '') IS NOT NULL THEN struct_pack(k := 'finish', v := NULLIF(trim(Finish), '')) END,
                        CASE WHEN NULLIF(trim(Color), '') IS NOT NULL THEN struct_pack(k := 'color', v := NULLIF(trim(Color), '')) END,
                        CASE WHEN NULLIF(trim(Frame), '') IS NOT NULL THEN struct_pack(k := 'frame', v := NULLIF(trim(Frame), '')) END,
                        CASE WHEN NULLIF(trim(Style), '') IS NOT NULL THEN struct_pack(k := 'style', v := NULLIF(trim(Style), '')) END,
                        CASE WHEN NULLIF(trim(Glaze), '') IS NOT NULL THEN struct_pack(k := 'glaze', v := NULLIF(trim(Glaze), '')) END,
                        CASE WHEN NULLIF(trim(Mount), '') IS NOT NULL THEN struct_pack(k := 'mount', v := NULLIF(trim(Mount), '')) END,
                        CASE WHEN NULLIF(trim("Mount color"), '') IS NOT NULL THEN struct_pack(k := 'mount_color', v := NULLIF(trim("Mount color"), '')) END,
                        CASE WHEN NULLIF(trim("Paper type"), '') IS NOT NULL THEN struct_pack(k := 'paper_type', v := NULLIF(trim("Paper type"), '')) END,
                        CASE WHEN NULLIF(trim("Substrate weight"), '') IS NOT NULL THEN struct_pack(k := 'substrate_weight', v := NULLIF(trim("Substrate weight"), '')) END,
                        CASE WHEN NULLIF(trim(Wrap), '') IS NOT NULL THEN struct_pack(k := 'wrap', v := NULLIF(trim(Wrap), '')) END,
                        CASE WHEN NULLIF(trim(Edge), '') IS NOT NULL THEN struct_pack(k := 'edge', v := NULLIF(trim(Edge), '')) END
                    ], x -> x IS NOT NULL))::MAP(VARCHAR, VARCHAR)) AS VARCHAR)
                END AS variant_key,
                trim(SKU) || '|' ||
                CASE
                    WHEN NULLIF(trim("Source country"), '') IS NOT NULL THEN trim("Source country") ELSE ''
                END || '|' ||
                CASE
                    WHEN NULLIF(trim("Destination country"), '') IS NOT NULL THEN trim("Destination country") ELSE ''
                END || '|' ||
                CASE
                    WHEN NULLIF(trim("Shipping method"), '') IS NOT NULL THEN trim("Shipping method") ELSE ''
                END || '|' ||
                CASE
                    WHEN NULLIF(trim(ServiceName), '') IS NOT NULL THEN trim(ServiceName) ELSE ''
                END || '|' ||
                CASE
                    WHEN NULLIF(trim(ServiceLevel), '') IS NOT NULL THEN trim(ServiceLevel) ELSE ''
                END AS route_key,
                NULLIF(trim("Source country"), '') AS source_country,
                NULLIF(trim("Destination country"), '') AS destination_country,
                NULLIF(trim("Destination Country Name"), '') AS destination_country_name,
                NULLIF(trim(RegionId), '') AS region_id,
                NULLIF(trim("Shipping method"), '') AS shipping_method,
                NULLIF(trim(ServiceName), '') AS service_name,
                NULLIF(trim(ServiceLevel), '') AS service_level,
                NULLIF(trim("Tracked shipping"), '') AS tracked_shipping,
                TRY_CAST(NULLIF(trim("Product price"), '') AS DECIMAL(12,2)) AS product_price,
                NULLIF(trim("Product currency"), '') AS product_currency,
                TRY_CAST(COALESCE(NULLIF(trim("Shipping price"), ''), NULLIF(trim(ShippingRate), '')) AS DECIMAL(12,2)) AS shipping_price,
                TRY_CAST(NULLIF(trim("Plus one shipping price"), '') AS DECIMAL(12,2)) AS plus_one_shipping_price,
                COALESCE(NULLIF(trim("Shipping currency"), ''), NULLIF(trim(Currency), '')) AS shipping_currency,
                TRY_CAST(COALESCE(NULLIF(trim("Minimum shipping (days)"), ''), NULLIF(trim(MinTransitDays), '')) AS INTEGER) AS min_shipping_days,
                TRY_CAST(COALESCE(NULLIF(trim("Maximum shipping (days)"), ''), NULLIF(trim(MaxTransitDays), '')) AS INTEGER) AS max_shipping_days
            FROM raw_prodigi
            WHERE NULLIF(trim(SKU), '') IS NOT NULL
        )
        SELECT
            row_number() OVER (ORDER BY rb.route_key) AS id,
            v.id AS variant_id,
            rb.route_key,
            rb.source_country,
            rb.destination_country,
            rb.destination_country_name,
            rb.region_id,
            rb.shipping_method,
            rb.service_name,
            rb.service_level,
            rb.tracked_shipping,
            rb.product_price,
            rb.product_currency,
            rb.shipping_price,
            rb.plus_one_shipping_price,
            rb.shipping_currency,
            rb.min_shipping_days,
            rb.max_shipping_days
        FROM (
            SELECT DISTINCT ON (route_key)
                *
            FROM route_base
            ORDER BY route_key
        ) rb
        JOIN variants_final v
          ON v.sku = rb.sku
         AND v.variant_key = rb.variant_key;
        """
    )


def _export_duckdb_tables(
    con: duckdb.DuckDBPyConnection,
    temp_dir: Path,
) -> tuple[Path, Path, Path]:
    products_path = temp_dir / "products.tsv"
    variants_path = temp_dir / "variants.tsv"
    routes_path = temp_dir / "routes.tsv"

    con.execute(
        f"""
        COPY (
            SELECT id, sku, category, product_type, product_description, size_cm, size_inches
            FROM products_final
        ) TO '{_quote_sql(products_path)}'
        WITH (FORMAT CSV, DELIMITER '\t', HEADER FALSE, NULL '\\N');
        """
    )
    con.execute(
        f"""
        COPY (
            SELECT
                id,
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
                normalized_medium,
                normalized_presentation,
                normalized_frame_type,
                normalized_material,
                CASE WHEN is_relevant_for_artshop THEN 'true' ELSE 'false' END
            FROM variants_final
        ) TO '{_quote_sql(variants_path)}'
        WITH (FORMAT CSV, DELIMITER '\t', HEADER FALSE, NULL '\\N');
        """
    )
    con.execute(
        f"""
        COPY (
            SELECT
                id,
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
                max_shipping_days
            FROM routes_final
        ) TO '{_quote_sql(routes_path)}'
        WITH (FORMAT CSV, DELIMITER '\t', HEADER FALSE, NULL '\\N');
        """
    )
    return products_path, variants_path, routes_path


def _copy_products_pg(cur, products_path: Path) -> None:
    _copy_file(
        cur,
        "prodigi_catalog_products",
        ("id", "sku", "category", "product_type", "product_description", "size_cm", "size_inches"),
        products_path,
    )


def _copy_variants_pg(cur, variants_path: Path) -> None:
    _copy_file(
        cur,
        "prodigi_catalog_variants",
        (
            "id",
            "product_id",
            "variant_key",
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
            "normalized_medium",
            "normalized_presentation",
            "normalized_frame_type",
            "normalized_material",
            "is_relevant_for_artshop",
        ),
        variants_path,
    )


def _copy_routes_pg(cur, routes_path: Path) -> None:
    total_bytes = routes_path.stat().st_size
    start_ts = time.perf_counter()
    _render_progress("Postgres", 0, total_bytes, start_ts)
    _copy_file(
        cur,
        "prodigi_catalog_routes",
        (
            "id",
            "variant_id",
            "route_key",
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
        ),
        routes_path,
    )
    _render_progress("Postgres", total_bytes, total_bytes, start_ts)
    print()


def _sync_sequences_pg(cur) -> None:
    for table in (
        "prodigi_catalog_products",
        "prodigi_catalog_variants",
        "prodigi_catalog_routes",
    ):
        cur.execute(
            f"""
            SELECT setval(
                pg_get_serial_sequence('{table}', 'id'),
                COALESCE((SELECT MAX(id) FROM {table}), 1),
                TRUE
            )
            """
        )


def _print_counts_pg(cur) -> None:
    for table in (
        "prodigi_catalog_products",
        "prodigi_catalog_variants",
        "prodigi_catalog_routes",
    ):
        cur.execute(f"SELECT count(*) FROM {table}")
        print(f"{table}: {cur.fetchone()[0]}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Fast DuckDB-based Prodigi importer")
    parser.add_argument("--max-files", type=int, default=None)
    parser.add_argument("--max-rows", type=int, default=None)
    args = parser.parse_args()

    files = _discover_files(max_files=args.max_files)
    if not files:
        raise SystemExit("No CSV files found under prodigy/")

    temp_dir = Path(tempfile.mkdtemp(prefix="prodigi_duckdb_"))
    duckdb_path = temp_dir / "prodigi.duckdb"

    total_start = time.perf_counter()
    try:
        con = duckdb.connect(str(duckdb_path))
        try:
            _prepare_duckdb(con)
            load_start = time.perf_counter()
            _ingest_files(con, files, max_rows=args.max_rows)
            print(f"duckdb raw load finished in {time.perf_counter() - load_start:.1f}s")

            normalize_start = time.perf_counter()
            _build_normalized_tables(con)
            print(f"duckdb normalize finished in {time.perf_counter() - normalize_start:.1f}s")

            export_start = time.perf_counter()
            products_path, variants_path, routes_path = _export_duckdb_tables(con, temp_dir)
            print(f"duckdb export finished in {time.perf_counter() - export_start:.1f}s")
        finally:
            con.close()

        pg = _connect_pg()
        pg.autocommit = False
        try:
            with pg.cursor() as cur:
                _truncate_pg(cur)
                _copy_products_pg(cur, products_path)
                _copy_variants_pg(cur, variants_path)
                _copy_routes_pg(cur, routes_path)
                _sync_sequences_pg(cur)
                pg.commit()
                _print_counts_pg(cur)
        finally:
            pg.close()
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)

    print(f"total elapsed: {time.perf_counter() - total_start:.1f}s")


if __name__ == "__main__":
    main()
