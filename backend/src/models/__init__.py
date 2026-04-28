"""
Central repository for all SQLAlchemy models used in the ArtShop.
Importing from this module ensures all models are registered and accessible.
"""

from src.models.artwork_print_assets import ArtworkPrintAssetOrm as ArtworkPrintAssetOrm
from src.models.artworks import ArtworksOrm as ArtworksOrm
from src.models.email_templates import EmailTemplateOrm as EmailTemplateOrm
from src.models.label_categories import LabelCategoriesOrm as LabelCategoriesOrm
from src.models.labels import LabelsOrm as LabelsOrm
from src.models.orders import OrdersOrm as OrdersOrm
from src.models.print_pricing import PrintPricingOrm as PrintPricingOrm
from src.models.print_pricing_regions import (
    PrintPricingRegionMultiplierOrm as PrintPricingRegionMultiplierOrm,
)
from src.models.print_pricing_regions import (
    PrintPricingRegionOrm as PrintPricingRegionOrm,
)
from src.models.prodigi_catalog import ProdigiCatalogProductOrm as ProdigiCatalogProductOrm
from src.models.prodigi_catalog import ProdigiCatalogRouteOrm as ProdigiCatalogRouteOrm
from src.models.prodigi_catalog import ProdigiCatalogVariantOrm as ProdigiCatalogVariantOrm
from src.models.prodigi_fulfillment import (
    ProdigiFulfillmentEventOrm as ProdigiFulfillmentEventOrm,
)
from src.models.prodigi_fulfillment import (
    ProdigiFulfillmentGateResultOrm as ProdigiFulfillmentGateResultOrm,
)
from src.models.prodigi_fulfillment import (
    ProdigiFulfillmentJobOrm as ProdigiFulfillmentJobOrm,
)
from src.models.prodigi_storefront import (
    ProdigiArtworkStorefrontPayloadOrm as ProdigiArtworkStorefrontPayloadOrm,
)
from src.models.prodigi_storefront import ProdigiStorefrontBakeOrm as ProdigiStorefrontBakeOrm
from src.models.prodigi_storefront import (
    ProdigiStorefrontOfferGroupOrm as ProdigiStorefrontOfferGroupOrm,
)
from src.models.prodigi_storefront import (
    ProdigiStorefrontOfferSizeOrm as ProdigiStorefrontOfferSizeOrm,
)
from src.models.site_settings import SiteSettingsOrm as SiteSettingsOrm
from src.models.user_likes import UserLikesOrm as UserLikesOrm
from src.models.users import UsersOrm as UsersOrm
