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

## Production data

Production catalog/storefront data is rebuilt on the production server from
Prodigi CSV/source files; it is not copied from a local database snapshot. Use:

```powershell
python -m src.integrations.prodigi.tasks.prodigi_production_prepare
```

That command rebuilds the active CSV-backed storefront bake, materializes
artwork storefront payloads, clears runtime print caches, and writes a validation
report. Add `--include-api-checks --include-quotes --require-api-checks` when the
server has the intended Prodigi API credentials and you want live provider
validation before opening fulfillment.

There are no compatibility shims for the old `src.services.prodigi_*`,
`src.repositories.prodigi_*`, `src.connectors.prodigi`, `src.api.*prodigi*`, or
`src.tasks.prodigi_*` modules. New backend code should import from
`src.integrations.prodigi...` directly.
