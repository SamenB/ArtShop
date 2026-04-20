from __future__ import annotations

import time
import sys
from pathlib import Path

import duckdb
import psycopg2

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.config import settings


def _csv_root() -> Path:
    return Path(__file__).resolve().parents[2] / "prodigy"


def _discover_files() -> list[Path]:
    return sorted(_csv_root().rglob("*.csv"))


def _quote_sql(path: Path) -> str:
    return str(path).replace("\\", "/").replace("'", "''")


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


def _variant_key_sql() -> str:
    return """
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
    END
    """


def _route_key_sql() -> str:
    return """
    trim(SKU) || '|' ||
    coalesce(NULLIF(trim("Source country"), ''), '') || '|' ||
    coalesce(NULLIF(trim("Destination country"), ''), '') || '|' ||
    coalesce(NULLIF(trim("Shipping method"), ''), '') || '|' ||
    coalesce(NULLIF(trim(ServiceName), ''), '') || '|' ||
    coalesce(NULLIF(trim(ServiceLevel), ''), '')
    """


def _connect_pg():
    return psycopg2.connect(
        host=settings.DB_HOST,
        port=settings.DB_PORT,
        dbname=settings.POSTGRES_DB,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
    )


def main() -> None:
    files = _discover_files()
    if not files:
        raise SystemExit("No CSV files found under prodigy/")

    total_bytes = sum(path.stat().st_size for path in files)
    processed_bytes = 0
    start = time.perf_counter()

    con = duckdb.connect()
    con.execute("PRAGMA threads=4")
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
        )
        """
    )
    variant_key_sql = _variant_key_sql()
    route_key_sql = _route_key_sql()

    for file_path in files:
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
                delim = ','
            )
            """
        )
        processed_bytes += file_path.stat().st_size
        _render_progress("Verify CSV", processed_bytes, total_bytes, start)

    print()

    csv_counts = {
        "products": con.execute(
            """
            SELECT count(DISTINCT trim(SKU))
            FROM raw_prodigi
            WHERE NULLIF(trim(SKU), '') IS NOT NULL
            """
        ).fetchone()[0],
        "variants": con.execute(
            f"""
            SELECT count(*)
            FROM (
                SELECT DISTINCT
                    trim(SKU) AS sku,
                    {variant_key_sql} AS variant_key
                FROM raw_prodigi
                WHERE NULLIF(trim(SKU), '') IS NOT NULL
            ) t
            """
        ).fetchone()[0],
        "routes": con.execute(
            f"""
            SELECT count(DISTINCT {route_key_sql})
            FROM raw_prodigi
            WHERE NULLIF(trim(SKU), '') IS NOT NULL
            """
        ).fetchone()[0],
    }
    con.close()

    pg = _connect_pg()
    try:
        with pg.cursor() as cur:
            db_counts = {}
            for table, key in (
                ("prodigi_catalog_products", "products"),
                ("prodigi_catalog_variants", "variants"),
                ("prodigi_catalog_routes", "routes"),
            ):
                cur.execute(f"SELECT count(*) FROM {table}")
                db_counts[key] = cur.fetchone()[0]
    finally:
        pg.close()

    print("CSV counts:")
    for key, value in csv_counts.items():
        print(f"  {key}: {value}")
    print("DB counts:")
    for key, value in db_counts.items():
        print(f"  {key}: {value}")
    print("Match:")
    for key in ("products", "variants", "routes"):
        print(f"  {key}: {'OK' if csv_counts[key] == db_counts[key] else 'MISMATCH'}")
    print(f"elapsed: {time.perf_counter() - start:.1f}s")


if __name__ == "__main__":
    main()
