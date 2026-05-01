# Prodigi integration boundary

This package owns Prodigi-specific backend behavior:

- API client and provider protocol mapping
- catalog import and preview logic
- storefront bake/read-model services
- fulfillment/order asset preparation
- Prodigi-specific repositories and operational scripts

Generic ArtShop concepts stay outside this package. Public HTTP routers remain
behind the print-provider boundary, SQLAlchemy models remain under `src.models`,
and provider-neutral print workflows stay behind `src.print_on_demand`.

## Catalog source layers

Prodigi catalog data is intentionally layered:

1. `catalog_pipeline.raw_source` reads the local/dev-only 4GB supplier dump from
   `PRODIGI_RAW_CSV_ROOT`.
2. `catalog_pipeline.curator` filters and normalizes those raw rows into the
   committed curated file:
   `src/integrations/prodigi/data/prodigi_storefront_source.csv`.
3. `catalog_pipeline.curated_source` is the runtime source used by production
   snapshot and payload rebuilds.
4. `catalog_pipeline.pipeline` plans, bakes, materializes artwork payloads, and
   leaves storefront/admin/order reads on the active bake/read-model path.

Generate the curated source locally with:

```powershell
python -m src.integrations.prodigi.tasks.prodigi_prepare_storefront_source
```

Production does not mount or read the raw 4GB CSV directory. The committed
curated CSV travels through GitHub with normal code deploys. When it or relevant
Prodigi pipeline/policy files change, CD runs:

```powershell
python -m src.integrations.prodigi.tasks.prodigi_production_prepare
```

That command rebuilds the active CSV-backed storefront bake, materializes
artwork storefront payloads, clears runtime print caches, and writes a validation
report. Add `--include-api-checks --include-quotes --require-api-checks` when the
server has the intended Prodigi API credentials and you want live provider
validation before opening fulfillment.

Full operational steps are in
[`docs/prodigi-production-runbook.md`](../../../../docs/prodigi-production-runbook.md).

## Prodigi sandbox order smoke with S3 asset delivery

Localhost can call Prodigi directly for Product Details and Quote checks, but
Prodigi must download order artwork from a public URL. The preferred local and
production path is:

```text
render PNG locally -> upload that PNG to S3 -> verify public HTTPS download + md5 -> POST sandbox order
```

Only rendered fulfillment PNGs use this storage path. Gallery images and master
print files remain on the existing local/static paths until we intentionally
migrate them.

Configure the backend process:

```powershell
$env:PRODIGI_SANDBOX = "true"
$env:PRODIGI_API_KEY = "<prodigi-sandbox-api-key>"
$env:PRINT_ASSET_STORAGE_BACKEND = "s3_compatible"
$env:PRINT_ASSET_BUCKET = "artshop-prodigi-assets"
$env:PRINT_ASSET_REGION = "eu-north-1"
$env:PRINT_ASSET_ACCESS_KEY_ID = "<iam-access-key-id>"
$env:PRINT_ASSET_SECRET_ACCESS_KEY = "<iam-secret-access-key>"
$env:PRINT_ASSET_PUBLIC_BASE_URL = "https://artshop-prodigi-assets.s3.eu-north-1.amazonaws.com"
$env:PRINT_ASSET_PREFIX = "prodigi"
```

For AWS S3, leave `PRINT_ASSET_ENDPOINT_URL` empty. That setting exists only for
S3-compatible providers such as Cloudflare R2 or MinIO.

Run the guarded playground:

```powershell
cd backend
.\venv\Scripts\python.exe -m src.integrations.prodigi.tasks.prodigi_sandbox_playground --artwork-id 2 --country DE --ratio 4:5 --per-country 1 --include-resize --create-sandbox-order
```

Before `POST /orders`, the playground uploads the rendered PNG, downloads it
back from `PRINT_ASSET_PUBLIC_BASE_URL`, verifies HTTP `2xx`, non-empty bytes,
and md5 parity with the local rendered file. If S3 is not configured or the
bucket policy does not allow public read for the object, the smoke stops before
creating the sandbox order.

There are no compatibility shims for the old `src.services.prodigi_*`,
`src.repositories.prodigi_*`, `src.connectors.prodigi`, `src.api.*prodigi*`, or
`src.tasks.prodigi_*` modules. New backend code should import from
`src.integrations.prodigi...` directly.
