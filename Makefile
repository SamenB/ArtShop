# ============================================================
# ArtShop — Dev Commands
# Usage: make <command>
# Windows: install make via "choco install make" or use WSL
# ============================================================

.PHONY: infra api worker frontend migrate test down

# Start infrastructure (PostgreSQL + Redis in Docker)
infra:
	docker-compose up -d

# Stop infrastructure
down:
	docker-compose down

# Start FastAPI backend with hot reload
api:
	cd backend && venv\Scripts\activate && uvicorn src.main:app --reload

# Start Celery worker (-P solo required on Windows)
worker:
	cd backend && venv\Scripts\activate && celery -A src.tasks.celery_app:celery_instance worker --loglevel=info -P solo

# Start Next.js frontend
frontend:
	cd frontend && npm run dev

# Run Alembic migrations (apply all)
migrate:
	cd backend && venv\Scripts\activate && alembic upgrade head

# Create a new migration (usage: make migrate-gen m="your message")
migrate-gen:
	cd backend && venv\Scripts\activate && alembic revision --autogenerate -m "$(m)"

# Run tests
test:
	cd backend && venv\Scripts\activate && pytest
