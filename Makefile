# ============================================================
# ArtShop — Dev Commands
# Usage: make <command>
# Windows: install make via "choco install make" or use WSL
# ============================================================

# Detect OS for venv activation
ifeq ($(OS),Windows_NT)
	ACTIVATE = venv\Scripts\activate
else
	ACTIVATE = source venv/bin/activate
endif

.PHONY: infra api worker beat frontend migrate migrate-gen test down

# Start infrastructure (PostgreSQL + Redis in Docker)
infra:
	docker-compose up -d

# Stop infrastructure
down:
	docker-compose down

# Start FastAPI backend with hot reload
api:
	cd backend && $(ACTIVATE) && uvicorn src.main:app --reload

# Start Celery worker (-P solo required on Windows, not needed on Mac/Linux)
ifeq ($(OS),Windows_NT)
worker:
	cd backend && $(ACTIVATE) && celery -A src.tasks.celery_app:celery_instance worker --loglevel=info -P solo
else
worker:
	cd backend && $(ACTIVATE) && celery -A src.tasks.celery_app:celery_instance worker --loglevel=info
endif

# Start Celery beat scheduler (runs periodic tasks)
beat:
	cd backend && $(ACTIVATE) && celery -A src.tasks.celery_app:celery_instance beat --loglevel=info

# Start Next.js frontend
frontend:
	cd frontend && npm run dev

# Run Alembic migrations (apply all)
migrate:
	cd backend && $(ACTIVATE) && alembic upgrade head

# Create a new migration (usage: make migrate-gen m="your message")
migrate-gen:
	cd backend && $(ACTIVATE) && alembic revision --autogenerate -m "$(m)"

# Run tests
test:
	cd backend && $(ACTIVATE) && pytest
