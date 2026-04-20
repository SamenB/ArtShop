"""
Lean two-pass Prodigi CSV importer.

Design goals:
- no giant staging tables inside PostgreSQL
- bounded RAM usage
- progress bar that shows the process is alive
- fast bulk insert path via COPY into final tables

Algorithm:
1. First pass over CSV files:
   - build unique products/variants in memory
   - write routes to a lightweight temp TSV on the host filesystem
2. COPY products into final table
3. COPY variants into final table
4. Read product/variant IDs back into small Python maps
5. Second pass over the local routes TSV:
   - replace (sku, variant_key) with variant_id
   - COPY routes directly into final table in chunks
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import shutil
import sys
import tempfile
import time
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
    except ValueError:
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


def _connect():
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


def _copy_buffer(cur, table: str, columns: tuple[str, ...], rows: list[list[str]]) -> None:
    if not rows:
        return
    buf = io.StringIO()
    writer = csv.writer(buf, delimiter="\t", lineterminator="\n")
    writer.writerows(rows)
    buf.seek(0)
    cur.copy_from(buf, table, sep="\t", null="\\N", columns=columns)


def _first_pass(
    files: list[Path],
    max_rows: int | None,
    routes_tmp_path: Path,
) -> dict[str, object]:
    total_bytes = sum(path.stat().st_size for path in files)
    processed_bytes = 0
    rows_seen = 0
    start_ts = time.perf_counter()

    products: dict[str, list[str]] = {}
    variants: dict[tuple[str, str], list[str]] = {}

    with routes_tmp_path.open("w", encoding="utf-8", newline="") as routes_fh:
        route_writer = csv.writer(routes_fh, delimiter="\t", lineterminator="\n")

        for file_path in files:
            with file_path.open("r", encoding="utf-8-sig", newline="") as handle:
                reader = csv.DictReader(handle)
                for row in reader:
                    if max_rows is not None and rows_seen >= max_rows:
                        break

                    rows_seen += 1
                    sku = _pick(row, "SKU")
                    if sku is None:
                        continue

                    category = _pick(row, "Category")
                    product_type = _pick(row, "Product type")
                    description = _pick(row, "Product description")
                    size_cm = _pick(row, "Size (cm)")
                    size_inches = _pick(row, "Size (inches)")

                    products.setdefault(
                        sku,
                        [
                            sku,
                            category or "\\N",
                            product_type or "\\N",
                            description or "\\N",
                            size_cm or "\\N",
                            size_inches or "\\N",
                        ],
                    )

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

                    variants.setdefault(
                        (sku, variant_key),
                        [
                            sku,
                            variant_key,
                            attributes["finish"] or "\\N",
                            attributes["color"] or "\\N",
                            attributes["frame"] or "\\N",
                            attributes["style"] or "\\N",
                            attributes["glaze"] or "\\N",
                            attributes["mount"] or "\\N",
                            attributes["mount_color"] or "\\N",
                            attributes["paper_type"] or "\\N",
                            attributes["substrate_weight"] or "\\N",
                            attributes["wrap"] or "\\N",
                            attributes["edge"] or "\\N",
                            "\\N",
                            normalized_medium or "\\N",
                            normalized_presentation or "\\N",
                            normalized_frame_type or "\\N",
                            normalized_material or "\\N",
                            _is_relevant_for_artshop(
                                normalized_medium,
                                normalized_presentation,
                                normalized_frame_type,
                                normalized_material,
                                description,
                                sku,
                            ),
                        ],
                    )

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

                    route_writer.writerow(
                        [
                            sku,
                            variant_key,
                            route_key,
                            source_country or "\\N",
                            destination_country or "\\N",
                            _pick(row, "Destination Country Name") or "\\N",
                            _pick(row, "RegionId") or "\\N",
                            shipping_method or "\\N",
                            service_name or "\\N",
                            service_level or "\\N",
                            _pick(row, "Tracked shipping") or "\\N",
                            _normalize_decimal(_pick(row, "Product price")) or "\\N",
                            _pick(row, "Product currency") or "\\N",
                            _normalize_decimal(_pick(row, "Shipping price", "ShippingRate")) or "\\N",
                            _normalize_decimal(_pick(row, "Plus one shipping price")) or "\\N",
                            _pick(row, "Shipping currency", "Currency") or "\\N",
                            _normalize_int(_pick(row, "Minimum shipping (days)", "MinTransitDays"))
                            or "\\N",
                            _normalize_int(_pick(row, "Maximum shipping (days)", "MaxTransitDays"))
                            or "\\N",
                        ]
                    )

                    if rows_seen % 20000 == 0:
                        _render_progress("Pass 1", processed_bytes, total_bytes, start_ts)

            processed_bytes += file_path.stat().st_size
            _render_progress("Pass 1", processed_bytes, total_bytes, start_ts)
            if max_rows is not None and rows_seen >= max_rows:
                break

    print()
    return {
        "rows_seen": rows_seen,
        "products": products,
        "variants": variants,
        "elapsed": time.perf_counter() - start_ts,
    }


def _truncate_final_tables(cur) -> None:
    cur.execute(
        """
        TRUNCATE TABLE prodigi_catalog_routes, prodigi_catalog_variants, prodigi_catalog_products
        RESTART IDENTITY CASCADE;
        """
    )


def _copy_products(cur, products: dict[str, list[str]], chunk_size: int) -> None:
    rows = list(products.values())
    for i in range(0, len(rows), chunk_size):
        _copy_buffer(
            cur,
            "prodigi_catalog_products",
            ("sku", "category", "product_type", "product_description", "size_cm", "size_inches"),
            rows[i : i + chunk_size],
        )


def _copy_variants(cur, variants: dict[tuple[str, str], list[str]], chunk_size: int) -> None:
    rows = []
    cur.execute("SELECT id, sku FROM prodigi_catalog_products")
    product_id_map = {sku: pid for pid, sku in cur.fetchall()}

    for row in variants.values():
        sku = row[0]
        rows.append(
            [
                str(product_id_map[sku]),
                *row[1:],
            ]
        )

    for i in range(0, len(rows), chunk_size):
        _copy_buffer(
            cur,
            "prodigi_catalog_variants",
            (
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
                "raw_attributes",
                "normalized_medium",
                "normalized_presentation",
                "normalized_frame_type",
                "normalized_material",
                "is_relevant_for_artshop",
            ),
            rows[i : i + chunk_size],
        )


def _build_variant_id_map(cur) -> dict[tuple[str, str], int]:
    cur.execute(
        """
        SELECT v.id, p.sku, v.variant_key
        FROM prodigi_catalog_variants v
        JOIN prodigi_catalog_products p ON p.id = v.product_id
        """
    )
    return {(sku, variant_key): variant_id for variant_id, sku, variant_key in cur.fetchall()}


def _copy_routes(
    cur,
    routes_tmp_path: Path,
    variant_id_map: dict[tuple[str, str], int],
    chunk_size: int,
) -> int:
    total_bytes = routes_tmp_path.stat().st_size
    processed_bytes = 0
    inserted = 0
    start_ts = time.perf_counter()
    batch: list[list[str]] = []

    with routes_tmp_path.open("r", encoding="utf-8", newline="") as handle:
        for raw_line in handle:
            processed_bytes += len(raw_line.encode("utf-8"))
            route = next(csv.reader([raw_line], delimiter="\t"))
            sku = route[0]
            variant_key = route[1]
            variant_id = variant_id_map[(sku, variant_key)]
            batch.append([str(variant_id), *route[2:]])
            inserted += 1

            if len(batch) >= chunk_size:
                _copy_buffer(
                    cur,
                    "prodigi_catalog_routes",
                    (
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
                    batch,
                )
                batch.clear()
                _render_progress("Pass 2", processed_bytes, total_bytes, start_ts)

        if batch:
            _copy_buffer(
                cur,
                "prodigi_catalog_routes",
                (
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
                batch,
            )
            _render_progress("Pass 2", total_bytes, total_bytes, start_ts)

    print()
    return inserted


def _print_counts(cur) -> None:
    for table in (
        "prodigi_catalog_products",
        "prodigi_catalog_variants",
        "prodigi_catalog_routes",
    ):
        cur.execute(f"SELECT count(*) FROM {table}")
        print(f"{table}: {cur.fetchone()[0]}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Lean import of Prodigi CSV catalog")
    parser.add_argument("--max-files", type=int, default=None)
    parser.add_argument("--max-rows", type=int, default=None)
    parser.add_argument("--chunk-size", type=int, default=50000)
    args = parser.parse_args()

    files = _discover_files(max_files=args.max_files)
    if not files:
        raise SystemExit("No CSV files found under prodigy/")

    temp_dir = Path(tempfile.mkdtemp(prefix="prodigi_routes_"))
    routes_tmp_path = temp_dir / "routes.tsv"

    total_start = time.perf_counter()
    try:
        pass1 = _first_pass(files, args.max_rows, routes_tmp_path)
        print(
            f"prepared: rows={pass1['rows_seen']} "
            f"products={len(pass1['products'])} variants={len(pass1['variants'])} "
            f"in {pass1['elapsed']:.1f}s"
        )

        conn = _connect()
        conn.autocommit = False
        try:
            with conn.cursor() as cur:
                _truncate_final_tables(cur)
                _copy_products(cur, pass1["products"], args.chunk_size)
                _copy_variants(cur, pass1["variants"], args.chunk_size)
                conn.commit()

                variant_id_map = _build_variant_id_map(cur)
                inserted_routes = _copy_routes(cur, routes_tmp_path, variant_id_map, args.chunk_size)
                conn.commit()

                print(f"routes inserted: {inserted_routes}")
                _print_counts(cur)
        finally:
            conn.close()
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)

    print(f"total elapsed: {time.perf_counter() - total_start:.1f}s")


if __name__ == "__main__":
    main()
