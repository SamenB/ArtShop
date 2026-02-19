from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from src.config import settings
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool

db_params = {}
if settings.MODE == "TEST":
    db_params["poolclass"] = NullPool


engine = create_async_engine(settings.DB_URL, echo=False, **db_params)
engine_null_pool = create_async_engine(settings.DB_URL, echo=False, poolclass=NullPool)


# create sessionmaker
new_session = async_sessionmaker(engine, expire_on_commit=False)
new_session_null_pool = async_sessionmaker(engine_null_pool, expire_on_commit=False)


class Base(DeclarativeBase):
    pass
