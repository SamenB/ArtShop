from src.repositories.base import BaseRepository
from src.models.collections import CollectionsOrm
from src.models.artworks import ArtworksOrm
from sqlalchemy import select
from src.repositories.mappers.mappers import CollectionMapper
from src.repositories.utils import available_artwork_ids


class CollectionsRepository(BaseRepository):
    model = CollectionsOrm
    mapper = CollectionMapper

    async def get_all(
        self,
        title: str | None,
        location: str | None,
        limit: int,
        offset: int,
    ):
        query = select(self.model)
        if title:
            query = query.filter(self.model.title.ilike(f"%{title}%"))
        if location:
            query = query.filter(self.model.location.ilike(f"%{location}%"))
        query = query.limit(limit).offset(offset)
        result = await self.session.execute(query)
        return [self.mapper.map_to_schema(model) for model in result.scalars().all()]

    async def get_available_collections(
        self,
        available: bool = True,
        limit: int = 10,
        offset: int = 0,
        title: str | None = None,
        location: str | None = None,
    ):
        artworks_ids_to_get = available_artwork_ids()
        collections_ids_with_artworks = select(ArtworksOrm.collection_id)
        if available:
            collections_ids_with_artworks = collections_ids_with_artworks.where(
                ArtworksOrm.id.in_(artworks_ids_to_get)
            )
        else:
            collections_ids_with_artworks = collections_ids_with_artworks.where(
                ArtworksOrm.id.notin_(artworks_ids_to_get)
            )

        query = select(self.model).where(CollectionsOrm.id.in_(collections_ids_with_artworks))
        if title:
            query = query.filter(self.model.title.ilike(f"%{title}%"))
        if location:
            query = query.filter(self.model.location.ilike(f"%{location}%"))
        query = query.limit(limit).offset(offset)

        result = await self.session.execute(query)
        return [self.mapper.map_to_schema(model) for model in result.scalars().all()]
