"""
Base repository providing common CRUD operations for SQLAlchemy models.
Automatically maps database models to Pydantic schemas using the provided mapper.
"""

from typing import Any, Sequence

from asyncpg import UniqueViolationError
from loguru import logger
from pydantic import BaseModel
from sqlalchemy import delete, insert, select, update
from sqlalchemy.exc import IntegrityError, NoResultFound

from src.database import Base
from src.exeptions import DatabaseException, ObjectAlreadyExistsException, ObjectNotFoundException
from src.repositories.mappers.base import DataMapper


class BaseRepository:
    """
    Abstract base class for repositories.
    Requires 'model' and 'mapper' attributes to be defined in subclasses.
    """

    model: type[Base]
    mapper: type[DataMapper]

    def __init__(self, session):
        """
        Initializes the repository with a database session.
        """
        self.session = session

    async def get_filtered(self, *filter, **filter_by) -> list[BaseModel | Any]:
        """
        Retrieves multiple records matching the given filters.
        """
        query = select(self.model).filter(*filter).filter_by(**filter_by)
        result = await self.session.execute(query)
        return [self.mapper.map_to_schema(model) for model in result.scalars().all()]

    async def get_all(self, *args, **kwargs) -> list[BaseModel | Any]:
        """
        Retrieves all records, optionally filtered by keyword arguments.
        """
        return await self.get_filtered(**kwargs)

    async def get_one_or_none(self, **filter_by) -> BaseModel | None | Any:
        """
        Retrieves a single record or returns None if no record matches the filter.
        """
        query = select(self.model).filter_by(**filter_by)
        result = await self.session.execute(query)
        model = result.scalars().one_or_none()
        if model is None:
            return None
        return self.mapper.map_to_schema(model)

    async def get_one(self, **filter_by) -> BaseModel | Any:
        """
        Retrieves a single record or raises ObjectNotFoundException if not found.
        """
        query = select(self.model).filter_by(**filter_by)
        result = await self.session.execute(query)
        try:
            model = result.scalar_one()
        except NoResultFound:
            msg = f"Object not found in {self.model.__tablename__}"
            logger.debug(f"{msg}: filters={filter_by}")
            raise ObjectNotFoundException(detail=msg)
        return self.mapper.map_to_schema(model)

    async def add(self, data: BaseModel | Sequence[BaseModel]) -> BaseModel | Sequence[BaseModel]:
        """
        Adds one or more records to the database.
        Returns the mapped schema of the newly created record.
        """
        if isinstance(data, BaseModel):
            data_to_insert = data.model_dump()
        else:
            data_to_insert = [sample.model_dump() for sample in data]
        try:
            add_stmt = insert(self.model).values(data_to_insert).returning(self.model)
            result = await self.session.execute(add_stmt)
            model = result.scalars().one()
        except IntegrityError as ex:
            logger.warning("IntegrityError in {}: {}", self.model.__tablename__, str(ex))
            if isinstance(ex.orig.__cause__, UniqueViolationError):
                raise ObjectAlreadyExistsException(
                    detail=f"Entity already exists in {self.model.__tablename__}"
                ) from ex
            else:
                raise DatabaseException(detail=str(ex))
        return self.mapper.map_to_schema(model)

    async def edit(self, data: BaseModel, exclude_unset: bool = False, **filter_by) -> None:
        """
        Updates an existing record matching the filter.
        """
        update_stmt = (
            update(self.model)
            .filter_by(**filter_by)
            .values(**data.model_dump(exclude_unset=exclude_unset))
        )
        await self.session.execute(update_stmt)

    async def delete(self, **filter_by) -> None:
        """
        Deletes records matching the given filter.
        """
        delete_stmt = delete(self.model).filter_by(**filter_by)
        await self.session.execute(delete_stmt)

    async def add_bulk(self, data: Sequence[BaseModel]) -> None:
        """
        Efficiently inserts multiple records in a single statement.
        Does not return the created records.
        """
        try:
            data_to_insert = [item.model_dump() for item in data]
            add_stmt = insert(self.model).values(data_to_insert)
            await self.session.execute(add_stmt)
        except IntegrityError as ex:
            if isinstance(ex.orig.__cause__, UniqueViolationError):
                raise ObjectAlreadyExistsException(
                    detail=f"Entity already exists in {self.model.__tablename__}"
                ) from ex
            else:
                raise DatabaseException(detail=str(ex))
