"""
Specific data mapper implementations for each domain entity.
These mappers link SQLAlchemy ORM models to their corresponding Pydantic schemas.
"""

from src.models.artwork_print_assets import ArtworkPrintAssetOrm
from src.models.artworks import ArtworksOrm
from src.models.email_templates import EmailTemplateOrm
from src.models.label_categories import LabelCategoriesOrm
from src.models.labels import ArtworkLabelsOrm, LabelsOrm
from src.models.orders import OrderItemOrm, OrdersOrm
from src.models.print_pricing import PrintAspectRatioOrm
from src.models.users import UsersOrm
from src.repositories.mappers.base import DataMapper
from src.schemas.artwork_print_assets import ArtworkPrintAsset
from src.schemas.artworks import Artwork
from src.schemas.email_templates import EmailTemplate
from src.schemas.labels import ArtworkLabel, Label, LabelCategory
from src.schemas.orders import Order, OrderItem
from src.schemas.print_pricing import AspectRatioItem
from src.schemas.users import User


class UserMapper(DataMapper):
    """Mapper for User entities."""

    db_model = UsersOrm
    schema = User


class ArtworkMapper(DataMapper):
    """Mapper for Artwork entities."""

    db_model = ArtworksOrm
    schema = Artwork


class ArtworkPrintAssetMapper(DataMapper):
    db_model = ArtworkPrintAssetOrm
    schema = ArtworkPrintAsset


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


class EmailTemplateMapper(DataMapper):
    """Mapper for EmailTemplate entities."""

    db_model = EmailTemplateOrm
    schema = EmailTemplate


class AspectRatioMapper(DataMapper):
    """Mapper for PrintAspectRatioOrm entities."""

    db_model = PrintAspectRatioOrm
    schema = AspectRatioItem


