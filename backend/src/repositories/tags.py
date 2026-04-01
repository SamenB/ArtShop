from sqlalchemy import select

from src.models.tags import ArtworkTagsOrm, TagsOrm
from src.repositories.base import BaseRepository
from src.repositories.mappers.mappers import ArtworkTagMapper, TagMapper


class TagsRepository(BaseRepository):
    model = TagsOrm
    mapper = TagMapper

    async def get_all_filtered(self, category: str | None = None):
        query = select(self.model)
        if category is not None:
            query = query.filter(self.model.category == category)
        result = await self.session.execute(query)
        models = result.scalars().all()
        return [self.mapper.map_to_schema(m) for m in models]


class ArtworkTagsRepository(BaseRepository):
    model = ArtworkTagsOrm
    mapper = ArtworkTagMapper

    async def set_artwork_tags(self, artwork_id: int, tag_ids: list[int]):
        from sqlalchemy import delete, insert
        get_current_tags_id_query = select(self.model.tag_id).where(
            self.model.artwork_id == artwork_id
        )
        result = await self.session.execute(get_current_tags_id_query)
        current_tags_id: list[int] = result.scalars().all()
        ids_to_delete = set(current_tags_id) - set(tag_ids)
        ids_to_add = set(tag_ids) - set(current_tags_id)

        if ids_to_delete:
            delete_stmt = delete(self.model).where(
                self.model.artwork_id == artwork_id,
                self.model.tag_id.in_(ids_to_delete),
            )
            await self.session.execute(delete_stmt)
        if ids_to_add:
            from sqlalchemy import insert
            add_stmt = insert(self.model).values(
                [{"artwork_id": artwork_id, "tag_id": tag_id} for tag_id in ids_to_add]
            )
            await self.session.execute(add_stmt)

