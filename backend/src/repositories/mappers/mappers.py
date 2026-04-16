"""
Specific data mapper implementations for each domain entity.
These mappers link SQLAlchemy ORM models to their corresponding Pydantic schemas.
"""

from src.models.artworks import ArtworksOrm
from src.models.label_categories import LabelCategoriesOrm
from src.models.labels import ArtworkLabelsOrm, LabelsOrm
from src.models.orders import OrderItemOrm, OrdersOrm
from src.models.users import UsersOrm
from src.repositories.mappers.base import DataMapper
from src.schemas.artworks import Artwork
from src.schemas.labels import ArtworkLabel, Label, LabelCategory
from src.schemas.orders import Order, OrderItem
from src.schemas.users import User


class UserMapper(DataMapper):
    """Mapper for User entities."""

    db_model = UsersOrm
    schema = User


class ArtworkMapper(DataMapper):
    """Mapper for Artwork entities."""

    db_model = ArtworksOrm
    schema = Artwork


class LabelCategoryMapper(DataMapper):
    db_model = LabelCategoriesOrm
    schema = LabelCategory


class LabelMapper(DataMapper):
    db_model = LabelsOrm
    schema = Label


class ArtworkLabelMapper(DataMapper):
    db_model = ArtworkLabelsOrm
    schema = ArtworkLabel


class OrderMapper(DataMapper):
    """Mapper for Order entities."""

    db_model = OrdersOrm
    schema = Order


class OrderItemMapper(DataMapper):
    """Mapper for OrderItem entities."""

    db_model = OrderItemOrm
    schema = OrderItem
