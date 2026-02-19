from pydantic import BaseModel, Field


class CollectionAdd(BaseModel):
    title: str = Field(..., description="Title of the collection")
    location: str = Field(..., description="Location of the collection")


class Collection(CollectionAdd):
    id: int = Field(..., description="ID of the collection")
    images: list[str] | None = Field(None, description="List of image URLs")


class CollectionPatch(BaseModel):
    title: str | None = Field(None, description="Title of the collection")
    location: str | None = Field(None, description="Location of the collection")
