from src.models.collections import CollectionsOrm
from src.repositories.base import BaseRepository
from src.repositories.mappers.mappers import CollectionMapper


class CollectionsRepository(BaseRepository):
    model = CollectionsOrm
    mapper = CollectionMapper
