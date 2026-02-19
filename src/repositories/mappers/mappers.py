from src.repositories.mappers.base import DataMapper
from src.models.users import UsersOrm
from src.models.collections import CollectionsOrm
from src.models.artworks import ArtworksOrm
from src.models.tags import TagsOrm, ArtworkTagsOrm
from src.models.orders import OrdersOrm
from src.schemas.collections import Collection
from src.schemas.users import User
from src.schemas.artworks import Artwork
from src.schemas.tags import Tag, ArtworkTag
from src.schemas.orders import Order


class CollectionMapper(DataMapper):
    db_model = CollectionsOrm
    schema = Collection


class UserMapper(DataMapper):
    db_model = UsersOrm
    schema = User


class ArtworkMapper(DataMapper):
    db_model = ArtworksOrm
    schema = Artwork


class TagMapper(DataMapper):
    db_model = TagsOrm
    schema = Tag


class ArtworkTagMapper(DataMapper):
    db_model = ArtworkTagsOrm
    schema = ArtworkTag


class OrderMapper(DataMapper):
    db_model = OrdersOrm
    schema = Order
