<div align="center">

# 🎨 ArtShop

**A fullstack art marketplace built with modern best practices.**

FastAPI · Next.js · PostgreSQL · Redis · Celery · Docker · CI/CD

[![CI](https://github.com/YOUR_USERNAME/ArtShop/actions/workflows/ci.yml/badge.svg)](https://github.com/YOUR_USERNAME/ArtShop/actions/workflows/ci.yml)
[![CD](https://github.com/YOUR_USERNAME/ArtShop/actions/workflows/cd.yml/badge.svg)](https://github.com/YOUR_USERNAME/ArtShop/actions/workflows/cd.yml)
[![Python 3.12](https://img.shields.io/badge/python-3.12-blue.svg)](https://www.python.org/downloads/)
[![Next.js 16](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

---

## Overview

ArtShop is a commercial open-source platform where artists can showcase and sell their artwork. The project demonstrates production-grade architecture including async Python backend, server-side rendered React frontend, background task processing, reverse proxy setup, and automated CI/CD deployment.

### Key Features

- 🖼️ **Artwork Management** — Upload, catalog, and sell artwork with image processing
- 🔐 **Authentication** — JWT-based auth with HTTP-only cookies and Google OAuth
- ⚡ **Background Processing** — Celery workers for async image processing tasks
- 📱 **Responsive Design** — Mobile-first UI built with Tailwind CSS 4
- 🚀 **CI/CD Pipeline** — Automated lint → test → deploy via GitHub Actions

## Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Python 3.12, FastAPI, SQLAlchemy 2.0, Pydantic v2 |
| **Frontend** | Next.js 16, React 19, TypeScript 5, Tailwind CSS 4 |
| **Database** | PostgreSQL 15, Alembic (migrations) |
| **Caching & Broker** | Redis 7, fastapi-cache2 |
| **Task Queue** | Celery 5 (worker + beat scheduler) |
| **Proxy** | Nginx (reverse proxy, gzip, rate limiting, security headers) |
| **Containerization** | Docker, Docker Compose (multi-service) |
| **CI/CD** | GitHub Actions (lint, type-check, test, deploy via SSH) |
| **Code Quality** | Ruff, Pyright, ESLint 9, TypeScript strict mode |

## Architecture

```
                    ┌──────────────────────────────────────────────┐
                    │                   Nginx :80                  │
                    │         (reverse proxy, TLS, gzip)           │
                    └──────┬──────────────────────┬────────────────┘
                           │                      │
                    /api/*, /static/*          /* (pages)
                           │                      │
                    ┌──────▼───────┐        ┌─────▼───────┐
                    │   FastAPI    │        │   Next.js   │
                    │    :8000     │        │    :3000    │
                    └──┬──────────┬┘        └─────────────┘
                       │          │
              ┌────────▼─────┐  ┌─▼────────┐
              │ PostgreSQL   │  │  Redis   │
              │   :5432      │  │  :6379   │
              └──────────────┘  └──┬───────┘
                                   │
                    ┌──────────────▼──────┐
                    │   Celery Worker +   │
                    │   Beat Scheduler    │
                    └─────────────────────┘
```

## Project Structure

```
ArtShop/
├── backend/
│   ├── src/
│   │   ├── main.py              # FastAPI app entry point
│   │   ├── config.py            # Pydantic Settings (env loading)
│   │   ├── database.py          # SQLAlchemy async engine & sessions
│   │   ├── api/                 # Route handlers (endpoints)
│   │   ├── models/              # SQLAlchemy ORM models
│   │   ├── schemas/             # Pydantic request/response schemas
│   │   ├── repositories/        # Data access layer (Repository pattern)
│   │   ├── services/            # Business logic layer
│   │   ├── tasks/               # Celery tasks & app configuration
│   │   ├── admin/               # SQLAdmin panel setup
│   │   ├── migrations/          # Alembic version scripts
│   │   └── utils/               # Shared utilities
│   ├── tests/
│   │   ├── conftest.py          # Fixtures (DB, auth, mock data)
│   │   ├── mocks/               # JSON test data
│   │   ├── unit_tests/          # Unit tests
│   │   └── integration_tests/   # API endpoint tests
│   ├── Dockerfile
│   ├── requirements.txt
│   └── pyproject.toml           # Ruff linter config
├── frontend/
│   ├── src/                     # Next.js App Router pages & components
│   ├── Dockerfile               # Multi-stage (dev + prod)
│   ├── eslint.config.mjs
│   └── tsconfig.json
├── nginx/
│   └── nginx.conf               # Reverse proxy configuration
├── .github/workflows/
│   ├── ci.yml                   # Lint → Type-check → Test
│   └── cd.yml                   # Deploy via SSH + Docker
├── docker-compose.yml           # Local dev (DB + Redis only)
├── docker-compose.prod.yml      # Production (8 services)
├── Makefile                     # Developer shortcuts
└── CLAUDE.md                    # AI agent context file
```

## Getting Started

### Prerequisites

- **Python** ≥ 3.12
- **Node.js** ≥ 20
- **Docker** & **Docker Compose**

### Local Development

Only infrastructure runs in Docker. Your code runs natively for fast hot reload and debugger support.

**1. Start infrastructure**

```bash
make infra    # Starts PostgreSQL + Redis in Docker
```

**2. Start backend**

```bash
cd backend
python -m venv venv

# Windows:
.\venv\Scripts\activate
# macOS / Linux:
source venv/bin/activate

pip install -r requirements.txt
alembic upgrade head              # Apply database migrations
uvicorn src.main:app --reload     # Start API server
```

> API docs: [http://localhost:8000/docs](http://localhost:8000/docs)

**3. Start frontend**

```bash
cd frontend
npm install
npm run dev
```

> App: [http://localhost:3000](http://localhost:3000)

**4. (Optional) Background workers**

```bash
make worker   # Celery worker for async tasks
make beat     # Celery Beat for scheduled tasks
```

### Make Commands

| Command | Description |
|---|---|
| `make infra` | Start PostgreSQL + Redis |
| `make api` | Start FastAPI (hot reload) |
| `make frontend` | Start Next.js dev server |
| `make worker` | Start Celery worker |
| `make beat` | Start Celery Beat scheduler |
| `make migrate` | Apply all Alembic migrations |
| `make migrate-gen m="msg"` | Auto-generate new migration |
| `make test` | Run test suite |
| `make down` | Stop Docker containers |

## Production Deployment

Full Docker stack with Nginx reverse proxy.

```bash
# 1. Configure environment
cp .env.example .env.prod
# Edit .env.prod with real secrets (POSTGRES_PASSWORD, JWT_SECRET_KEY, etc.)

# 2. Build and deploy all services
docker compose -f docker-compose.prod.yml up --build -d

# 3. Verify
docker compose -f docker-compose.prod.yml ps
curl http://localhost/health
```

### Production Services

| Service | Container | Role |
|---|---|---|
| Nginx | `artshop_nginx` | Reverse proxy (ports 80/443) |
| FastAPI | `artshop_api` | REST API backend |
| Next.js | `artshop_frontend` | SSR frontend |
| PostgreSQL | `artshop_db` | Primary database |
| Redis | `artshop_redis` | Cache & message broker |
| Celery Worker | `artshop_worker` | Background task processing |
| Celery Beat | `artshop_beat` | Periodic task scheduler |
| Migrator | `artshop_migrator` | Runs migrations, then exits |

## CI/CD Pipeline

Automated via **GitHub Actions**:

```
Push / PR  ──►  CI Pipeline
                 ├─ backend-lint    (Ruff + Pyright)
                 ├─ frontend-lint   (ESLint + TSC + Build)
                 └─ backend-test    (Pytest + PostgreSQL + Redis)
                         │
                  CI passes on main
                         │
                         ▼
                CD Pipeline ──► SSH → git pull → docker compose up --build
```

**Required GitHub Secrets:**

| Secret | Description |
|---|---|
| `SSH_HOST` | Server IP or domain |
| `SSH_USER` | SSH username |
| `SSH_PRIVATE_KEY` | SSH private key |
| `POSTGRES_PASSWORD` | Production DB password |
| `JWT_SECRET_KEY` | JWT signing secret |
| `ADMIN_EMAILS` | JSON array of admin emails |

## Code Quality

- **Python Linting:** [Ruff](https://docs.astral.sh/ruff/) (line-length=100)
- **Python Type Checking:** [Pyright](https://github.com/microsoft/pyright) (strict)
- **JavaScript/TypeScript Linting:** [ESLint 9](https://eslint.org/) with `eslint-config-next`
- **TypeScript:** Strict mode enabled
- **Pre-deploy Checks:** All linters + formatters + type checkers + tests run in CI before merge

## Environment Variables

Copy `.env.example` to `.env` for local development:

| Variable | Default | Description |
|---|---|---|
| `MODE` | `LOCAL` | `LOCAL` / `TEST` / `PROD` |
| `POSTGRES_DB` | `artshop` | Database name |
| `POSTGRES_USER` | `postgres` | Database user |
| `POSTGRES_PASSWORD` | `postgres` | Database password |
| `DB_HOST` | `localhost` | `localhost` (local) or `db` (Docker) |
| `REDIS_HOST` | `localhost` | `localhost` (local) or `redis` (Docker) |
| `JWT_SECRET_KEY` | — | **Must change in production** |
| `ADMIN_EMAILS` | — | JSON array of admin email addresses |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | API URL for frontend |

## Testing

```bash
make test    # Run full test suite
```

Tests require running PostgreSQL and Redis (`make infra`).

- **Framework:** pytest + pytest-asyncio
- **Coverage:** Unit tests (schemas, repos, services) + Integration tests (API endpoints)
- **Isolation:** Fresh database per session, mock data loaded from JSON fixtures
- **Cache:** Production cache decorator mocked with InMemoryBackend in tests

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

<div align="center">

Built with ❤️ by [Semen Bondarenko](https://github.com/YOUR_USERNAME)

</div>
