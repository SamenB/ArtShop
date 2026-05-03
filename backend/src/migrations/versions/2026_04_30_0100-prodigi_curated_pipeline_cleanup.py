"""prodigi curated pipeline cleanup

Revision ID: d91e8f4a6c20
Revises: c4a5f6b7d890
Create Date: 2026-04-30 01:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d91e8f4a6c20"
down_revision: Union[str, Sequence[str], None] = "c4a5f6b7d890"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "prodigi_storefront_bakes",
        sa.Column("source_sha256", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "prodigi_storefront_bakes",
        sa.Column("source_row_count", sa.Integer(), nullable=True),
    )
    op.add_column(
        "prodigi_storefront_bakes",
        sa.Column("source_size_bytes", sa.BigInteger(), nullable=True),
    )
    op.add_column(
        "prodigi_storefront_bakes",
        sa.Column("pipeline_version", sa.String(length=120), nullable=True),
    )
    op.add_column(
        "prodigi_storefront_bakes",
        sa.Column("policy_version", sa.String(length=120), nullable=True),
    )

    op.execute("DROP TABLE IF EXISTS prodigi_catalog_routes CASCADE")
    op.execute("DROP TABLE IF EXISTS prodigi_catalog_variants CASCADE")
    op.execute("DROP TABLE IF EXISTS prodigi_catalog_products CASCADE")


def downgrade() -> None:
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
    )
    op.create_index(
        op.f("ix_prodigi_catalog_products_sku"),
        "prodigi_catalog_products",
        ["sku"],
        unique=True,
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
        sa.ForeignKeyConstraint(
            ["product_id"],
            ["prodigi_catalog_products.id"],
            ondelete="CASCADE",
        ),
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
        sa.ForeignKeyConstraint(
            ["variant_id"],
            ["prodigi_catalog_variants.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_prodigi_catalog_routes_route_key"),
        "prodigi_catalog_routes",
        ["route_key"],
        unique=True,
    )
    op.create_index(
        op.f("ix_prodigi_catalog_routes_variant_id"),
        "prodigi_catalog_routes",
        ["variant_id"],
        unique=False,
    )

    for column_name in (
        "policy_version",
        "pipeline_version",
        "source_size_bytes",
        "source_row_count",
        "source_sha256",
    ):
        op.drop_column("prodigi_storefront_bakes", column_name)
