# ArtShop

Fullstack art marketplace. FastAPI backend + Next.js frontend + PostgreSQL + Redis + Celery.

---

## 🚀 Local Development (Recommended)

Only infrastructure runs in Docker. Your code runs locally — fast hot reload, debugger works.

### Step 1 — Start infrastructure (one time, keep running)
```bash
docker-compose up -d
```
This starts: **PostgreSQL** on port `5432` and **Redis** on port `6379`.

### Step 2 — Start backend
```bash
cd backend
# First time only:
pip install -r requirements.txt
# Run:
uvicorn src.main:app --reload
```
API available at: http://localhost:8000/docs

### Step 3 — Start frontend
```bash
cd frontend
# First time only:
npm install
# Run:
npm run dev
```
App available at: http://localhost:3000

### Step 4 — (Optional) Start Celery worker
Open a separate terminal:
```bash
cd backend
celery -A src.tasks.celery_app worker --loglevel=info
```

---

## 🐳 Production / Full Docker Stack

All services run in Docker containers.

### Setup
1. Copy `.env.prod` to `.env.prod` and fill in real secrets (especially `POSTGRES_PASSWORD` and `JWT_SECRET_KEY`).
2. Run:
```bash
docker-compose -f docker-compose.prod.yml up --build -d
```

Services:
| Service | Port | Description |
|---|---|---|
| PostgreSQL | 5432 | Database |
| Redis | 6379 | Cache / Message broker |
| FastAPI | 8000 | Backend API |
| Celery Worker | — | Background tasks |
| Next.js | 3000 | Frontend |

---

## 📁 Project Structure
```
ArtShop/
├── backend/          # FastAPI app
│   ├── src/
│   │   ├── main.py       # App entry point
│   │   ├── config.py     # Settings (reads from .env)
│   │   ├── api/          # Route handlers
│   │   ├── models/       # SQLAlchemy models
│   │   └── tasks/        # Celery tasks
│   └── Dockerfile
├── frontend/         # Next.js app
│   └── Dockerfile
├── .env              # Local dev secrets (DO NOT COMMIT)
├── .env.prod         # Prod secrets (DO NOT COMMIT)
├── .env.example      # Template — commit this
├── docker-compose.yml       # Local: DB + Redis only
└── docker-compose.prod.yml  # Prod: full stack
```

---

## 🗒 Cheatsheet

### Alembic (Database Migrations)
```bash
# Create a new migration (auto-detect model changes)
alembic revision --autogenerate -m "describe what changed"

# Apply all pending migrations
alembic upgrade head

# Rollback one step back
alembic downgrade -1

# Rollback to specific revision
alembic downgrade <revision_id>

# Show current revision
alembic current

# Show full migration history
alembic history --verbose
```

### Make Commands
```bash
make infra                        # Start PostgreSQL + Redis in Docker
make api                          # Start FastAPI (hot reload)
make worker                       # Start Celery worker
make frontend                     # Start Next.js
make migrate                      # Apply all migrations
make migrate-gen m="add users"    # Create new migration
make test                         # Run tests
make down                         # Stop Docker
```
