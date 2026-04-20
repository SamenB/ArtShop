"""add prodigi catalog tables

Revision ID: e1b6d4f2c901
Revises: 9ac9db18866e
Create Date: 2026-04-20 19:10:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e1b6d4f2c901"
down_revision: Union[str, Sequence[str], None] = "9ac9db18866e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "prodigi_catalog_products",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("sku", sa.String(length=120), nullable=False),
        sa.Column("category", sa.String(length=120), nullable=True),
        sa.Column("product_type", sa.String(length=120), nullable=True),
        sa.Column("product_description", sa.Text(), nullable=True),
        sa.Column("size_cm", sa.String(length=80), nullable=True),
        sa.Column("size_inches", sa.String(length=80), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("sku"),
    )
    op.create_index(
        op.f("ix_prodigi_catalog_products_sku"),
        "prodigi_catalog_products",
        ["sku"],
        unique=False,
    )

    op.create_table(
        "prodigi_catalog_variants",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("variant_key", sa.String(length=500), nullable=False),
        sa.Column("finish", sa.String(length=120), nullable=True),
        sa.Column("color", sa.String(length=80), nullable=True),
        sa.Column("frame", sa.String(length=160), nullable=True),
        sa.Column("style", sa.String(length=200), nullable=True),
        sa.Column("glaze", sa.String(length=160), nullable=True),
        sa.Column("mount", sa.String(length=120), nullable=True),
        sa.Column("mount_color", sa.String(length=120), nullable=True),
        sa.Column("paper_type", sa.String(length=120), nullable=True),
        sa.Column("substrate_weight", sa.String(length=80), nullable=True),
        sa.Column("wrap", sa.String(length=80), nullable=True),
        sa.Column("edge", sa.String(length=80), nullable=True),
        sa.Column("raw_attributes", sa.JSON(), nullable=True),
        sa.Column("normalized_medium", sa.String(length=40), nullable=True),
        sa.Column("normalized_presentation", sa.String(length=40), nullable=True),
        sa.Column("normalized_frame_type", sa.String(length=40), nullable=True),
        sa.Column("normalized_material", sa.String(length=80), nullable=True),
        sa.Column("is_relevant_for_artshop", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["product_id"], ["prodigi_catalog_products.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("product_id", "variant_key", name="uq_prodigi_variant_product_key"),
    )
    op.create_index(
        op.f("ix_prodigi_catalog_variants_product_id"),
        "prodigi_catalog_variants",
        ["product_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_prodigi_catalog_variants_variant_key"),
        "prodigi_catalog_variants",
        ["variant_key"],
        unique=False,
    )
    op.create_index(
        op.f("ix_prodigi_catalog_variants_normalized_medium"),
        "prodigi_catalog_variants",
        ["normalized_medium"],
        unique=False,
    )
    op.create_index(
        op.f("ix_prodigi_catalog_variants_normalized_presentation"),
        "prodigi_catalog_variants",
        ["normalized_presentation"],
        unique=False,
    )
    op.create_index(
        op.f("ix_prodigi_catalog_variants_normalized_frame_type"),
        "prodigi_catalog_variants",
        ["normalized_frame_type"],
        unique=False,
    )
    op.create_index(
        op.f("ix_prodigi_catalog_variants_normalized_material"),
        "prodigi_catalog_variants",
        ["normalized_material"],
        unique=False,
    )
    op.create_index(
        op.f("ix_prodigi_catalog_variants_is_relevant_for_artshop"),
        "prodigi_catalog_variants",
        ["is_relevant_for_artshop"],
        unique=False,
    )

    op.create_table(
        "prodigi_catalog_routes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("variant_id", sa.Integer(), nullable=False),
        sa.Column("route_key", sa.String(length=500), nullable=False),
        sa.Column("source_country", sa.String(length=8), nullable=True),
        sa.Column("destination_country", sa.String(length=8), nullable=True),
        sa.Column("destination_country_name", sa.String(length=120), nullable=True),
        sa.Column("region_id", sa.String(length=80), nullable=True),
        sa.Column("shipping_method", sa.String(length=80), nullable=True),
        sa.Column("service_name", sa.String(length=160), nullable=True),
        sa.Column("service_level", sa.String(length=80), nullable=True),
        sa.Column("tracked_shipping", sa.String(length=40), nullable=True),
        sa.Column("product_price", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("product_currency", sa.String(length=8), nullable=True),
        sa.Column("shipping_price", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("plus_one_shipping_price", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("shipping_currency", sa.String(length=8), nullable=True),
        sa.Column("min_shipping_days", sa.Integer(), nullable=True),
        sa.Column("max_shipping_days", sa.Integer(), nullable=True),
        sa.Column("source_csv_path", sa.String(length=500), nullable=True),
        sa.Column("raw_row", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["variant_id"], ["prodigi_catalog_variants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("route_key"),
    )
    op.create_index(
        op.f("ix_prodigi_catalog_routes_variant_id"),
        "prodigi_catalog_routes",
        ["variant_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_prodigi_catalog_routes_route_key"),
        "prodigi_catalog_routes",
        ["route_key"],
        unique=False,
    )
    op.create_index(
        op.f("ix_prodigi_catalog_routes_source_country"),
        "prodigi_catalog_routes",
        ["source_country"],
        unique=False,
    )
    op.create_index(
        op.f("ix_prodigi_catalog_routes_destination_country"),
        "prodigi_catalog_routes",
        ["destination_country"],
        unique=False,
    )
    op.create_index(
        op.f("ix_prodigi_catalog_routes_region_id"),
        "prodigi_catalog_routes",
        ["region_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_prodigi_catalog_routes_shipping_method"),
        "prodigi_catalog_routes",
        ["shipping_method"],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_prodigi_catalog_routes_shipping_method"), table_name="prodigi_catalog_routes")
    op.drop_index(op.f("ix_prodigi_catalog_routes_region_id"), table_name="prodigi_catalog_routes")
    op.drop_index(op.f("ix_prodigi_catalog_routes_destination_country"), table_name="prodigi_catalog_routes")
    op.drop_index(op.f("ix_prodigi_catalog_routes_source_country"), table_name="prodigi_catalog_routes")
    op.drop_index(op.f("ix_prodigi_catalog_routes_route_key"), table_name="prodigi_catalog_routes")
    op.drop_index(op.f("ix_prodigi_catalog_routes_variant_id"), table_name="prodigi_catalog_routes")
    op.drop_table("prodigi_catalog_routes")

    op.drop_index(op.f("ix_prodigi_catalog_variants_is_relevant_for_artshop"), table_name="prodigi_catalog_variants")
    op.drop_index(op.f("ix_prodigi_catalog_variants_normalized_material"), table_name="prodigi_catalog_variants")
    op.drop_index(op.f("ix_prodigi_catalog_variants_normalized_frame_type"), table_name="prodigi_catalog_variants")
    op.drop_index(op.f("ix_prodigi_catalog_variants_normalized_presentation"), table_name="prodigi_catalog_variants")
    op.drop_index(op.f("ix_prodigi_catalog_variants_normalized_medium"), table_name="prodigi_catalog_variants")
    op.drop_index(op.f("ix_prodigi_catalog_variants_variant_key"), table_name="prodigi_catalog_variants")
    op.drop_index(op.f("ix_prodigi_catalog_variants_product_id"), table_name="prodigi_catalog_variants")
    op.drop_table("prodigi_catalog_variants")

    op.drop_index(op.f("ix_prodigi_catalog_products_sku"), table_name="prodigi_catalog_products")
    op.drop_table("prodigi_catalog_products")
