# Prodigi Production Snapshot Runbook

This is the operational path for moving Prodigi storefront snapshot and payload
changes from development into production.

## Architecture

Prodigi catalog data now has a zero layer before the normal snapshot pipeline:

1. **Raw source**: the original 4GB supplier CSV dump, stored only on a dev
   machine and ignored by git.
2. **Curated source**: one deterministic filtered CSV committed with the app:
   `backend/src/integrations/prodigi/data/prodigi_storefront_source.csv`.
3. **Snapshot pipeline**: parser -> planner -> storefront bake tables.
4. **Materializer**: rebuilds artwork storefront payloads from the active bake.
5. **Runtime**: storefront/admin/order flows read the active bake and
   materialized payloads, not the raw supplier dump.

Production never needs the raw 4GB CSV directory. A normal GitHub deploy is
enough to transport the curated CSV and pipeline code.

## Local CSV Release Flow

1. Place or update the raw supplier CSV folder locally. The default ignored path
   is `Prodigy/`; override it with `PRODIGI_RAW_CSV_ROOT` when needed.
2. Generate the committed curated source:

```bash
cd backend
python -m src.integrations.prodigi.tasks.prodigi_prepare_storefront_source
```

3. Review the printed stats:
   - `raw_files_seen`
   - `raw_rows_seen`
   - `curated_rows_written`
   - `duplicate_route_rows`
   - `output_size_bytes`
4. Commit the generated file together with related policy/pipeline code:

```bash
git add backend/src/integrations/prodigi/data/prodigi_storefront_source.csv
git add backend/src/integrations/prodigi
git commit -m "Update Prodigi storefront source"
```

5. Push to GitHub. CI/CD deploys the code and curated CSV.

The generator fails if the curated CSV exceeds 80MB unless you explicitly pass
`--allow-large`. That keeps us below GitHub's normal 100MB file limit.

## Automatic Production Prepare

The CD workflow captures the deployed SHA before and after `git reset --hard
origin/main`. If any of these paths changed, it automatically runs production
prepare after Docker deploy:

- `backend/src/integrations/prodigi/data/prodigi_storefront_source.csv`
- `backend/src/integrations/prodigi/catalog_pipeline/`
- relevant Prodigi policy/catalog task files

The automatic command is:

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml run --rm api \
  python -m src.integrations.prodigi.tasks.prodigi_production_prepare \
  --include-api-checks \
  --include-quotes \
  --output /tmp/prodigi_production_prepare_report.json
```

This rebuilds the active storefront bake and materialized artwork payloads in
the production database from the committed curated CSV.

## Manual Fallback

Use the manual GitHub workflow when you want to rerun prepare without a new
deploy:

`Actions -> Prodigi Production Prepare -> Run workflow`

It checks that the committed curated CSV exists on the server, applies Alembic
migrations, and runs the same production prepare command over SSH.

You can also run it directly on the server:

```bash
ssh <server-user>@<server-host>
cd ~/ArtShop
docker compose --env-file .env.prod -f docker-compose.prod.yml run --rm migrator alembic upgrade head
docker compose --env-file .env.prod -f docker-compose.prod.yml run --rm api \
  python -m src.integrations.prodigi.tasks.prodigi_production_prepare \
  --include-api-checks \
  --include-quotes \
  --output /tmp/prodigi_production_prepare_report.json
```

## What To Check After Release

Open the admin UI and confirm:

- Orders tab loads without API 500.
- Active Prodigi storefront bake exists.
- Artwork storefront payload count is non-zero.
- Validation report is approved or ready.
- Fulfillment preflight is green until the public asset URL/S3 boundary.

Until S3 or another public HTTPS asset store is configured, real Prodigi order
submission should remain blocked by the public asset URL gate.

## Mental Model

Code and curated CSV travel through GitHub.

Production database rows are generated in production by
`prodigi_production_prepare`.

The raw supplier CSV dump stays local/dev-only and never has to be mounted into
Docker or copied to the server.
