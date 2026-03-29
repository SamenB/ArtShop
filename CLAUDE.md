# CLAUDE.md — ArtShop Project Context

> This file provides context for AI coding agents to minimize token usage and onboarding time.

## Project Overview

**ArtShop** — fullstack art marketplace (commercial open-source).
- **Backend:** Python 3.12, FastAPI, SQLAlchemy 2.0, Alembic, Celery + Redis, PostgreSQL 15
- **Frontend:** Next.js 16, React 19, TypeScript 5, Tailwind CSS 4, ESLint 9
- **Infrastructure:** Docker Compose (7 services + Nginx), GitHub Actions CI/CD

## Architecture

```
Browser → Nginx (:80) → Frontend (Next.js :3000) — for pages
                       → Backend  (FastAPI :8000) — for /api/*, /static/*, /docs
Backend → PostgreSQL (:5432) — data storage
        → Redis (:6379) — cache + Celery broker
        → Celery Worker — background tasks (image processing)
        → Celery Beat — periodic scheduled tasks
```

## Directory Structure

```
ArtShop/
├── backend/
│   ├── src/
│   │   ├── main.py           # FastAPI entry point
│   │   ├── config.py         # Pydantic Settings (.env loading)
│   │   ├── database.py       # SQLAlchemy engine/session
│   │   ├── api/              # Route handlers (endpoints)
│   │   ├── models/           # SQLAlchemy ORM models
│   │   ├── schemas/          # Pydantic request/response schemas
│   │   ├── repositories/     # DB access layer (Repository pattern)
│   │   ├── services/         # Business logic
│   │   ├── tasks/            # Celery tasks & celery_app config
│   │   ├── connectors/       # External service integrations
│   │   ├── utils/            # Shared utilities
│   │   └── migrations/       # Alembic migrations
│   ├── tests/
│   │   ├── conftest.py       # Fixtures (DB setup, auth, mock data)
│   │   ├── mocks/            # JSON mock data files
│   │   ├── unit_tests/       # Unit tests (repos, schemas, services)
│   │   └── integration_tests/# API endpoint tests (need DB/Redis)
│   ├── static/               # Uploaded files (gitignored)
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── pyproject.toml        # Ruff config
│   └── pytest.ini
├── frontend/
│   ├── src/                  # Next.js App Router source
│   ├── public/               # Static assets
│   ├── Dockerfile            # Multi-stage (dev + prod)
│   ├── package.json
│   ├── eslint.config.mjs
│   └── tsconfig.json
├── nginx/
│   └── nginx.conf            # Reverse proxy config
├── .github/workflows/
│   ├── ci.yml                # Lint + test pipeline
│   └── cd.yml                # Deploy to server via SSH
├── docker-compose.yml        # Local dev (DB + Redis only)
├── docker-compose.prod.yml   # Production (all 8 services)
├── Makefile                  # Dev shortcuts
└── .env.example              # Env vars template
```

## Development Commands

```bash
# Infrastructure (Docker)
make infra                         # Start PostgreSQL + Redis
make down                          # Stop Docker containers

# Backend
make api                           # Start FastAPI with hot reload
make worker                        # Start Celery worker
make beat                          # Start Celery Beat scheduler

# Frontend
make frontend                      # Start Next.js dev server

# Database
make migrate                       # Apply all Alembic migrations
make migrate-gen m="description"   # Create new migration

# Testing
make test                          # Run pytest (needs DB + Redis running)

# Production
docker compose -f docker-compose.prod.yml up --build -d   # Full stack deploy
```

## Linting & Formatting

### Backend (Python)
- **Linter:** Ruff (config in `pyproject.toml`, line-length=100)
- **Formatter:** Ruff format (replaces Black)
- **Type checker:** Pyright
- **Run:** `ruff check backend/` and `ruff format --check backend/`

### Frontend (TypeScript/React)
- **Linter:** ESLint 9 with `eslint-config-next` (core-web-vitals + typescript)
- **Type checker:** TypeScript `tsc --noEmit`
- **Run:** `cd frontend && npx eslint .` and `npx tsc --noEmit`

## Environment Variables

All env vars are documented in `.env.example`. Key variables:
- `MODE` — `LOCAL` | `TEST` | `PROD`
- `DB_HOST` — `localhost` (local dev) or `db` (Docker)
- `REDIS_HOST` — `localhost` (local dev) or `redis` (Docker)
- `JWT_SECRET_KEY` — must be changed in production
- `NEXT_PUBLIC_API_URL` — API URL for frontend

## Testing Requirements

Tests require running PostgreSQL and Redis. The test suite:
1. Creates fresh tables (drops + creates via SQLAlchemy metadata)
2. Loads mock data from `tests/mocks/*.json`
3. Tests run with `MODE=TEST` (asserted in conftest)
4. Uses `pytest-asyncio` with `asyncio_mode=auto`

## Key Patterns

- **Repository Pattern:** All DB access goes through `repositories/` via `DBManager`
- **Schema Validation:** All input/output validated with Pydantic schemas
- **Background Tasks:** Heavy work (image processing) via Celery tasks
- **Auth:** JWT tokens stored in HTTP-only cookies
- **Caching:** `fastapi-cache2` with Redis backend (mocked in tests with InMemoryBackend)

## CI/CD Pipeline

1. **CI** (every push/PR): Ruff lint → Ruff format → Pyright → ESLint → TSC → Next.js build → Pytest
2. **CD** (main branch, after CI passes): SSH → git pull → generate .env.prod → docker compose up --build

## Common Gotchas

- Celery on Windows needs `-P solo` flag (handled in Makefile)
- Alembic migrations must be run from `backend/` directory
- Frontend `.env.local` is gitignored — use `NEXT_PUBLIC_API_URL` env var
- `fastapi-cache` decorator is monkey-patched in test `conftest.py`
- `pyproject.toml` has per-file Ruff ignores for `conftest.py` and `models/`
