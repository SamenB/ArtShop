import os
from typing import Type

from sqladmin import ModelView
from wtforms import Form, MultipleFileField
from starlette.datastructures import UploadFile
from src.tasks.tasks import process_and_attach_image
from src.models.users import UsersOrm
from src.models.artworks import ArtworksOrm
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
    column_list = [
        ArtworksOrm.id, ArtworksOrm.title,
        ArtworksOrm.is_display_only, ArtworksOrm.original_price,
        ArtworksOrm.is_original_available, ArtworksOrm.print_price,
        ArtworksOrm.prints_available, ArtworksOrm.tags,
    ]
    column_searchable_list = [ArtworksOrm.title]
    column_sortable_list = [
        ArtworksOrm.title, ArtworksOrm.is_display_only,
        ArtworksOrm.is_original_available, ArtworksOrm.prints_available,
    ]
    column_details_list = [
        ArtworksOrm.id, ArtworksOrm.title, ArtworksOrm.description,
        ArtworksOrm.is_display_only, ArtworksOrm.original_price,
        ArtworksOrm.is_original_available, ArtworksOrm.print_price,
        ArtworksOrm.prints_total, ArtworksOrm.prints_available,
        ArtworksOrm.tags, ArtworksOrm.images,
    ]

    # Hide raw images JSON from the form, it is managed by Celery
    form_excluded_columns = [ArtworksOrm.images]

    form_args = {
        "description": {"label": "Full Description"},
    }

    name = "Artwork"
    name_plural = "Artworks"
    icon = "fa-solid fa-paintbrush"
    page_size = 50
    can_export = True

    # Custom templates that add Select2 init and Display-Only toggle JS
    create_template = "artwork_create.html"
    edit_template = "artwork_edit.html"

    async def scaffold_form(self, rules=None) -> Type[Form]:
        # Build the default form from the ORM model
        form_class = await super().scaffold_form(rules)
        # Inject the file upload field into the form class
        form_class.upload_images = MultipleFileField("Upload Images")
        return form_class

    async def on_model_change(self, data: dict, model, is_created: bool, request) -> None:
        images_data = data.pop("upload_images", [])

        # Check if real files were uploaded (not empty strings)
        has_files = images_data and any(
            isinstance(f, UploadFile) and f.filename for f in images_data
        )

        if has_files:
            temp_paths = []
            os.makedirs("temp", exist_ok=True)
            for upload_file in images_data:
                if isinstance(upload_file, UploadFile) and upload_file.filename:
                    temp_path = f"temp/{upload_file.filename}"
                    content = await upload_file.read()
                    with open(temp_path, "wb") as f:
                        f.write(content)
                    temp_paths.append(temp_path)

            # Store paths on request so after_model_change can dispatch Celery task
            request.state.pending_images = temp_paths

    async def after_model_change(self, data: dict, model, is_created: bool, request) -> None:
        temp_paths = getattr(request.state, "pending_images", [])
        if temp_paths:
            process_and_attach_image.delay(
                model_type="artwork",
                model_id=model.id,
                temp_paths=temp_paths,
            )


class TagAdmin(ModelView, model=TagsOrm):
    column_list = [TagsOrm.id, TagsOrm.title]
    column_searchable_list = [TagsOrm.title]
    form_columns = [TagsOrm.title]
    name = "Tag"
    name_plural = "Tags"
    icon = "fa-solid fa-tag"


class OrderAdmin(ModelView, model=OrdersOrm):
    column_list = [
        OrdersOrm.id, OrdersOrm.user_id, OrdersOrm.created_at,
        OrdersOrm.edition_type, OrdersOrm.price,
    ]
    column_sortable_list = [OrdersOrm.created_at, OrdersOrm.price, OrdersOrm.edition_type]
    column_default_sort = ("created_at", True)
    can_create = False
    can_edit = True
    can_delete = True
    name = "Order"
    name_plural = "Orders"
    icon = "fa-solid fa-cart-shopping"
    can_export = True
