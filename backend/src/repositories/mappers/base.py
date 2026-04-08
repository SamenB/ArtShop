"""
Base class for mapping between database models and Pydantic schemas.
"""

from typing import Any, ClassVar

from pydantic import BaseModel


class DataMapper:
    """
    Abstract base class for data mappers.
    Subclasses must define 'db_model' and 'schema'.
    """

    db_model: ClassVar[type[Any]]
    schema: ClassVar[type[BaseModel]]

    @classmethod
    def map_to_schema(cls, model) -> Any:
        """
        Validates and converts an ORM model instance into a Pydantic schema instance.
        """
        return cls.schema.model_validate(model, from_attributes=True)

    @classmethod
    def map_to_orm(cls, data):
        """
        Converts a Pydantic schema instance into an ORM model instance.
        """
        return cls.db_model(**data.model_dump())
