from typing import ClassVar, Any
from pydantic import BaseModel


class DataMapper:
    """Base Data Mapper for ORM ↔ Schema transformation."""

    db_model: ClassVar[type[Any]]
    schema: ClassVar[type[BaseModel]]

    @classmethod
    def map_to_schema(cls, model) -> Any:
        """ORM model → Pydantic schema"""
        return cls.schema.model_validate(model, from_attributes=True)

    @classmethod
    def map_to_orm(cls, data):
        """Pydantic schema → ORM model"""
        return cls.db_model(**data.model_dump())
