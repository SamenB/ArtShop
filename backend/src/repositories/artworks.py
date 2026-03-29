from sqlalchemy import select
from sqlalchemy.orm import joinedload

from src.models.artworks import ArtworksOrm
from src.models.tags import TagsOrm
from src.repositories.base import BaseRepository
from src.repositories.mappers.mappers import ArtworkMapper
from src.repositories.utils import available_artwork_ids
from src.schemas.artworks import ArtworkWithTags


class ArtworksRepository(BaseRepository):
    model = ArtworksOrm
    mapper = ArtworkMapper
    """
    with artworks_count as (
        select artwork_id, count(*) as artworks_ordered from orders
        where check_in_date  <= :date_to
        and check_out_date >= :date_from
        group by artwork_id
    ),
    available_artworks as(
        select artworks.id as artwork_id, quantity - coalesce(artworks_ordered, 0) as artworks_available from artworks
        left join artworks_count on artworks.id = artworks_count.artwork_id

    )
    select * from available_artworks
    where artworks_available > 0 and artwork_id in (
        select id from artworks where collection_id = {collection_id}
    )
    """

    async def get_available_artworks(
        self,
        limit: int = 10,
        offset: int = 0,
        title: str | None = None,
        tags: list[int] | None = None,
    ):
        artworks_ids_to_get = available_artwork_ids()

        query = (
            select(self.model)
            .options(joinedload(self.model.tags))
            .filter(self.model.id.in_(artworks_ids_to_get))
        )

        if title:
            query = query.filter(self.model.title.ilike(f"%{title}%"))

        if tags:
            query = query.filter(self.model.tags.any(TagsOrm.id.in_(tags)))

        query = query.limit(limit).offset(offset)

        result = await self.session.execute(query)
        return [
            ArtworkWithTags.model_validate(model, from_attributes=True)
            for model in result.unique().scalars().all()
        ]

    async def get_one_or_none(self, **filter_by):
        query = select(self.model).options(joinedload(self.model.tags)).filter_by(**filter_by)
        result = await self.session.execute(query)
        model = result.unique().scalars().one_or_none()
        if model is None:
            return None
        return ArtworkWithTags.model_validate(model, from_attributes=True)
