"""
Central repository for all SQLAlchemy models used in the ArtShop.
Importing from this module ensures all models are registered and accessible.
"""

from src.models.artworks import ArtworksOrm as ArtworksOrm
from src.models.label_categories import LabelCategoriesOrm as LabelCategoriesOrm
from src.models.labels import LabelsOrm as LabelsOrm
from src.models.orders import OrdersOrm as OrdersOrm
from src.models.site_settings import SiteSettingsOrm as SiteSettingsOrm
from src.models.user_likes import UserLikesOrm as UserLikesOrm
from src.models.users import UsersOrm as UsersOrm
