from pydantic import BaseModel, Field


class TagAdd(BaseModel):
    title: str = Field(..., description="Title of the tag")


class Tag(TagAdd):
    id: int = Field(..., description="ID of the tag")


class ArtworkTagAdd(BaseModel):
    tag_id: int = Field(..., description="ID of the tag")
    artwork_id: int = Field(..., description="ID of the artwork")


class ArtworkTag(ArtworkTagAdd):
    id: int = Field(..., description="ID of the artwork tag")
