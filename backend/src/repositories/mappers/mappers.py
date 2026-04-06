"""
Specific data mapper implementations for each domain entity.
These mappers link SQLAlchemy ORM models to their corresponding Pydantic schemas.
"""
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
    """Mapper for User entities."""
    db_model = UsersOrm
    schema = User


class ArtworkMapper(DataMapper):
    """Mapper for Artwork entities."""
    db_model = ArtworksOrm
    schema = Artwork


class TagMapper(DataMapper):
    """Mapper for Tag entities."""
    db_model = TagsOrm
    schema = Tag


class ArtworkTagMapper(DataMapper):
    """Mapper for ArtworkTag association entities."""
    db_model = ArtworkTagsOrm
    schema = ArtworkTag


class OrderMapper(DataMapper):
    """Mapper for Order entities."""
    db_model = OrdersOrm
    schema = Order


class OrderItemMapper(DataMapper):
    """Mapper for OrderItem entities."""
    db_model = OrderItemOrm
    schema = OrderItem


class CollectionMapper(DataMapper):
    """Mapper for Collection entities."""
    db_model = CollectionsOrm
    schema = Collection
