from sqlalchemy import select

from src.models.label_categories import LabelCategoriesOrm
from src.models.labels import ArtworkLabelsOrm, LabelsOrm
from src.repositories.base import BaseRepository
from src.repositories.mappers.mappers import ArtworkLabelMapper, LabelCategoryMapper, LabelMapper


class LabelCategoriesRepository(BaseRepository):
    model = LabelCategoriesOrm
    mapper = LabelCategoryMapper


class LabelsRepository(BaseRepository):
    model = LabelsOrm
    mapper = LabelMapper

    async def get_all_filtered(self, category_id: int | None = None):
        query = select(self.model)
        if category_id is not None:
            query = query.filter(self.model.category_id == category_id)
        result = await self.session.execute(query)
        models = result.scalars().all()
        return [self.mapper.map_to_schema(m) for m in models]


class ArtworkLabelsRepository(BaseRepository):
    model = ArtworkLabelsOrm
    mapper = ArtworkLabelMapper

    async def set_artwork_labels(self, artwork_id: int, label_ids: list[int]):
        from sqlalchemy import delete, insert

        get_current_labels_id_query = select(self.model.label_id).where(
            self.model.artwork_id == artwork_id
        )
        result = await self.session.execute(get_current_labels_id_query)
        current_labels_id: list[int] = result.scalars().all()
        ids_to_delete = set(current_labels_id) - set(label_ids)
        ids_to_add = set(label_ids) - set(current_labels_id)

        if ids_to_delete:
            delete_stmt = delete(self.model).where(
                self.model.artwork_id == artwork_id,
                self.model.label_id.in_(ids_to_delete),
            )
            await self.session.execute(delete_stmt)
        if ids_to_add:
            add_stmt = insert(self.model).values(
                [{"artwork_id": artwork_id, "label_id": label_id} for label_id in ids_to_add]
            )
            await self.session.execute(add_stmt)
