from src.models.tags import ArtworkTagsOrm
from src.repositories.base import BaseRepository
from src.models.tags import TagsOrm
from src.repositories.mappers.mappers import TagMapper, ArtworkTagMapper
from sqlalchemy import select, delete, insert


class TagsRepository(BaseRepository):
    model = TagsOrm
    mapper = TagMapper


class ArtworkTagsRepository(BaseRepository):
    model = ArtworkTagsOrm
    mapper = ArtworkTagMapper

    async def set_artwork_tags(self, artwork_id: int, tag_ids: list[int]):
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
            add_stmt = insert(self.model).values(
                [{"artwork_id": artwork_id, "tag_id": tag_id} for tag_id in ids_to_add]
            )
            await self.session.execute(add_stmt)
