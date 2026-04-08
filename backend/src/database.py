"""
Database foundation layer for the application.
Configures SQLAlchemy asynchronous engines, connection pooling strategies,
and session factories for both standard and high-concurrency (null-pool) operations.
"""

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool

from src.config import settings

# Determine primary engine parameters based on environment mode.
db_params = {}
if settings.MODE == "TEST":
    # Disable connection pooling during tests to ensure isolated, clean states.
    db_params["poolclass"] = NullPool


# standard_engine: Used for the majority of application requests.
# Inherits pooling configuration from db_params if applicable.
engine = create_async_engine(settings.DB_URL, echo=False, **db_params)

# null_pool_engine: Explicitly bypasses connection pooling.
# Useful for background tasks (Celery) or scripts where persistent connections
# might lead to exhaustion or stale states.
engine_null_pool = create_async_engine(settings.DB_URL, echo=False, poolclass=NullPool)


# new_session: Standard factory for generating scoped asynchronous database sessions.
new_session = async_sessionmaker(engine, expire_on_commit=False)

# new_session_null_pool: Specialized factory using the null-pool engine.
new_session_null_pool = async_sessionmaker(engine_null_pool, expire_on_commit=False)


class Base(DeclarativeBase):
    """
    Common base class for all SQLAlchemy Declarative ORM models.
    Enables unified schema management and metadata discovery.
    """

    pass
