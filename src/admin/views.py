from sqladmin import ModelView
from src.models.users import UsersOrm
from src.models.artworks import ArtworksOrm
from src.models.collections import CollectionsOrm
from src.models.tags import TagsOrm
from src.models.orders import OrdersOrm

class UserAdmin(ModelView, model=UsersOrm):
    column_list = [UsersOrm.id, UsersOrm.username, UsersOrm.email]
    column_searchable_list = [UsersOrm.username, UsersOrm.email]
    column_details_exclude_list = [UsersOrm.hashed_password]
    can_create = False
    can_edit = True
    can_delete = True
    can_view_details = True
    name = "User"
    name_plural = "Users"
    icon = "fa-solid fa-user"
    page_size = 50
    can_export = True

class ArtworkAdmin(ModelView, model=ArtworksOrm):
    column_list = [ArtworksOrm.id, ArtworksOrm.title, ArtworksOrm.collection, ArtworksOrm.price, ArtworksOrm.quantity, ArtworksOrm.tags]
    column_searchable_list = [ArtworksOrm.title]
    column_sortable_list = [ArtworksOrm.price, ArtworksOrm.quantity, ArtworksOrm.title]
    column_details_list = [ArtworksOrm.id, ArtworksOrm.title, ArtworksOrm.description, ArtworksOrm.price, ArtworksOrm.quantity, ArtworksOrm.collection, ArtworksOrm.tags]
    form_columns = [ArtworksOrm.title, ArtworksOrm.description, ArtworksOrm.price, ArtworksOrm.quantity, ArtworksOrm.collection, ArtworksOrm.tags]
    form_args = {
        "description": {"label": "Full Description"},
    }
    name = "Artwork"
    name_plural = "Artworks"
    icon = "fa-solid fa-paintbrush"
    page_size = 50
    can_export = True

class CollectionAdmin(ModelView, model=CollectionsOrm):
    column_list = [CollectionsOrm.id, CollectionsOrm.title, CollectionsOrm.location]
    column_searchable_list = [CollectionsOrm.title, CollectionsOrm.location]
    form_columns = [CollectionsOrm.title, CollectionsOrm.location, CollectionsOrm.images]
    name = "Collection"
    name_plural = "Collections"
    icon = "fa-solid fa-layer-group"
    can_export = True

class TagAdmin(ModelView, model=TagsOrm):
    column_list = [TagsOrm.id, TagsOrm.title]
    column_searchable_list = [TagsOrm.title]
    form_columns = [TagsOrm.title]
    name = "Tag"
    name_plural = "Tags"
    icon = "fa-solid fa-tag"

class OrderAdmin(ModelView, model=OrdersOrm):
    column_list = [OrdersOrm.id, OrdersOrm.user_id, OrdersOrm.created_at, OrdersOrm.price]
    column_sortable_list = [OrdersOrm.created_at, OrdersOrm.price]
    column_default_sort = ('created_at', True) # Descending
    can_create = False
    can_edit = True
    can_delete = True
    name = "Order"
    name_plural = "Orders"
    icon = "fa-solid fa-cart-shopping"
    can_export = True
