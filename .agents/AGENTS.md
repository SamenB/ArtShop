# ArtShop Agent Rules

Read this once before changing ArtShop. Keep it loaded mentally; do not expand it into more files unless the user asks.

## Working Rule

1. Start with `git status --short`. Preserve unrelated dirty work.
2. Inspect the closest real files before editing. Do not guess architecture from filenames.
3. Find the source of truth before adding logic: backend service, repository, schema, migration, materialized payload, frontend context, or external provider.
4. Reuse local patterns first. Add abstractions only when they remove real duplication or isolate a clear responsibility.
5. Keep diffs focused. Do not reformat, rename, move, or "clean up" unrelated files.
6. For non-trivial work, trace the full path across UI, API, service, persistence, cache, and tests before patching one layer.

## Commands

Prefer Makefile:

```powershell
make infra
make api
make frontend
make migrate
make test
```

Useful direct checks:

```powershell
cd backend; .\venv\Scripts\ruff.exe check .
cd backend; .\venv\Scripts\ruff.exe format --check .
cd backend; .\venv\Scripts\python.exe -m pytest -v
cd frontend; npm.cmd exec eslint .
cd frontend; npm.cmd exec tsc -- --noEmit
cd frontend; npm.cmd run build
git diff --check
```

## Backend Standard

Backend stack: FastAPI, async SQLAlchemy, Alembic, PostgreSQL, Redis, Celery.

Current layers:

- `backend/src/api`: HTTP/auth/request/response mapping only.
- `backend/src/services`: use cases, business rules, orchestration, transaction timing.
- `backend/src/repositories`: SQL/ORM query and persistence details.
- `backend/src/schemas`: Pydantic API contracts.
- `backend/src/models`: SQLAlchemy persistence shape.
- `backend/src/utils/db_manager.py`: unit-of-work style `DBManager`.
- `backend/src/integrations/*`: provider-specific boundaries.

Rules:

- Do not put business policy in routes, serializers, Celery tasks, frontend code, or cache keys.
- Services normally own commits/rollbacks. Repositories do not decide business policy.
- Schema changes require Alembic migrations. If admin/orders break after schema work, check migration state first.
- Celery tasks stay thin: receive IDs/light payloads, fetch current state, call services, use explicit retry/idempotency policy.
- Redis/cache may improve latency, but database/materialized state remains the correctness source.

## Prodigi Standard

Prodigi is a core integration under `backend/src/integrations/prodigi`, not generic utility code.

Preserve this pipeline:

```text
supplier/curated data
-> catalog pipeline and policies
-> bake tables and materialized storefront payloads
-> storefront read-model services
-> frontend configurator/shop/checkout
-> order fulfillment workflow and callbacks
```

Rules:

- Runtime storefront data should come from materialized/read-model paths, not raw supplier rows.
- Pricing, shipping, discounts, payment state, order economics, and fulfillment state are backend-authoritative.
- If shop, artwork page, checkout, payment, admin, and fulfillment disagree, treat it as a release blocker.
- If storefront UI looks stale, inspect bake/materialized payload/cache policy before changing React.
- Keep sandbox/live order guards such as `PRODIGI_SANDBOX` and public callback URL checks.
- `make prodigi-source` and `make prodigi-rebuild` are maintenance commands, not runtime services.

## Frontend Standard

Frontend stack: Next.js App Router, React, TypeScript strict, Tailwind CSS, `lucide-react`.

Target split:

- route/page: routing, URL state, data orchestration, high-level layout;
- feature API/model: backend calls, DTOs, mapping, formatting, validation;
- feature UI: presentational components with narrow props;
- shared components/context: only for genuine cross-route reuse.

Rules:

- Do not grow large mixed files when a small extraction is practical.
- Avoid `any`; use exact DTOs or `unknown` with narrowing.
- Use `apiFetch` plus `apiJson` for backend JSON calls.
- Do not duplicate backend business calculations in React. Frontend formats and presents.
- Reuse tokens/classes from `frontend/src/app/globals.css`; avoid new one-off colors, shadows, breakpoints, and big inline style blocks.
- Interactive UI needs semantic elements, labels, focus, keyboard behavior, and clear loading/empty/error states.

High-pressure files: `OrdersTab.tsx`, `ProdigiHubTab.tsx`, `checkout/page.tsx`, `PrintConfigurator.tsx`, `ProdigiSnapshotTab.tsx`, `shop/page.tsx`, `Navbar.tsx`, `Lightbox.tsx`, `gallery/page.tsx`, `profile/page.tsx`.

When touching them, prefer extracting nearby `types.ts`, `utils.ts`, `api.ts`, `hooks.ts`, or focused presentational components.

## Quality Bar

- Single source of truth beats duplicated "quick fixes".
- Small explicit modules beat clever generic helpers.
- Data integrity beats UI optimism.
- Measured performance fixes beat speculative caching.
- Tests scale with risk: business rules, APIs, repositories, migrations, checkout/payment/fulfillment, and meaningful UI branches need coverage.
- Final handoff must say what changed, why it fits the architecture, what checks ran, and what risk remains.
