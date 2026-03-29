from pydantic import BaseModel, ConfigDict, Field


class CollectionAdd(BaseModel):
    title: str = Field(..., description="Title of the collection")
    bg_color: str | None = Field(
        None, description="Hex color code for collection background gradient"
    )


class CollectionPatch(BaseModel):
    title: str | None = Field(None, description="Title of the collection")
    bg_color: str | None = Field(
        None, description="Hex color code for collection background gradient"
    )


class Collection(CollectionAdd):
    id: int = Field(..., description="ID of the collection")

    model_config = ConfigDict(from_attributes=True)
