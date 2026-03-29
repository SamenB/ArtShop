from src.models.artworks import ArtworksOrm
from src.models.collections import CollectionsOrm
from src.models.orders import OrderItemOrm, OrdersOrm
from src.models.tags import ArtworkTagsOrm, TagsOrm
from src.models.users import UsersOrm
from src.repositories.mappers.base import DataMapper
from src.schemas.artworks import Artwork
from src.schemas.collections import Collection
from src.schemas.orders import Order, OrderItem
from src.schemas.tags import ArtworkTag, Tag
from src.schemas.users import User


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


class OrderItemMapper(DataMapper):
    db_model = OrderItemOrm
    schema = OrderItem


class CollectionMapper(DataMapper):
    db_model = CollectionsOrm
    schema = Collection
