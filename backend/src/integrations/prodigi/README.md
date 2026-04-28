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

There are no compatibility shims for the old `src.services.prodigi_*`,
`src.repositories.prodigi_*`, `src.connectors.prodigi`, `src.api.*prodigi*`, or
`src.tasks.prodigi_*` modules. New backend code should import from
`src.integrations.prodigi...` directly.
