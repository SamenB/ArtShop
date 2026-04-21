"""add prodigi storefront bake tables

Revision ID: b7a4f2c913ab
Revises: e1b6d4f2c901
Create Date: 2026-04-21 21:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b7a4f2c913ab"
down_revision: Union[str, Sequence[str], None] = "e1b6d4f2c901"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "prodigi_storefront_bakes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("bake_key", sa.String(length=120), nullable=False),
        sa.Column("paper_material", sa.String(length=120), nullable=False),
        sa.Column("include_notice_level", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("status", sa.String(length=30), server_default="ready", nullable=False),
        sa.Column("ratio_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("country_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("offer_group_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("offer_size_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("bake_key"),
    )
    op.create_index(
        op.f("ix_prodigi_storefront_bakes_bake_key"),
        "prodigi_storefront_bakes",
        ["bake_key"],
        unique=False,
    )
    op.create_index(
        op.f("ix_prodigi_storefront_bakes_is_active"),
        "prodigi_storefront_bakes",
        ["is_active"],
        unique=False,
    )
    op.create_index(
        op.f("ix_prodigi_storefront_bakes_paper_material"),
        "prodigi_storefront_bakes",
        ["paper_material"],
        unique=False,
    )

    op.create_table(
        "prodigi_storefront_offer_groups",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("bake_id", sa.Integer(), nullable=False),
        sa.Column("ratio_label", sa.String(length=20), nullable=False),
        sa.Column("ratio_title", sa.String(length=120), nullable=True),
        sa.Column("destination_country", sa.String(length=8), nullable=False),
        sa.Column("destination_country_name", sa.String(length=120), nullable=True),
        sa.Column("category_id", sa.String(length=80), nullable=False),
        sa.Column("category_label", sa.String(length=120), nullable=False),
        sa.Column("material_label", sa.String(length=120), nullable=True),
        sa.Column("frame_label", sa.String(length=120), nullable=True),
        sa.Column("storefront_action", sa.String(length=30), nullable=False),
        sa.Column("fulfillment_level", sa.String(length=30), nullable=False),
        sa.Column("geography_scope", sa.String(length=30), nullable=False),
        sa.Column("tax_risk", sa.String(length=30), nullable=False),
        sa.Column("source_countries", sa.JSON(), nullable=True),
        sa.Column("fastest_delivery_days", sa.String(length=40), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("fixed_attributes", sa.JSON(), nullable=True),
        sa.Column("recommended_defaults", sa.JSON(), nullable=True),
        sa.Column("allowed_attributes", sa.JSON(), nullable=True),
        sa.Column("available_size_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("min_total_cost", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("max_total_cost", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("currency", sa.String(length=8), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["bake_id"],
            ["prodigi_storefront_bakes.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "bake_id",
            "ratio_label",
            "destination_country",
            "category_id",
            name="uq_prodigi_storefront_group_bake_ratio_country_category",
        ),
    )
    op.create_index(
        op.f("ix_prodigi_storefront_offer_groups_bake_id"),
        "prodigi_storefront_offer_groups",
        ["bake_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_prodigi_storefront_offer_groups_category_id"),
        "prodigi_storefront_offer_groups",
        ["category_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_prodigi_storefront_offer_groups_destination_country"),
        "prodigi_storefront_offer_groups",
        ["destination_country"],
        unique=False,
    )
    op.create_index(
        op.f("ix_prodigi_storefront_offer_groups_fulfillment_level"),
        "prodigi_storefront_offer_groups",
        ["fulfillment_level"],
        unique=False,
    )
    op.create_index(
        op.f("ix_prodigi_storefront_offer_groups_geography_scope"),
        "prodigi_storefront_offer_groups",
        ["geography_scope"],
        unique=False,
    )
    op.create_index(
        op.f("ix_prodigi_storefront_offer_groups_ratio_label"),
        "prodigi_storefront_offer_groups",
        ["ratio_label"],
        unique=False,
    )
    op.create_index(
        op.f("ix_prodigi_storefront_offer_groups_storefront_action"),
        "prodigi_storefront_offer_groups",
        ["storefront_action"],
        unique=False,
    )
    op.create_index(
        op.f("ix_prodigi_storefront_offer_groups_tax_risk"),
        "prodigi_storefront_offer_groups",
        ["tax_risk"],
        unique=False,
    )

    op.create_table(
        "prodigi_storefront_offer_sizes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("offer_group_id", sa.Integer(), nullable=False),
        sa.Column("slot_size_label", sa.String(length=80), nullable=False),
        sa.Column("size_label", sa.String(length=80), nullable=True),
        sa.Column("available", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("is_exact_match", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("centroid_size_label", sa.String(length=80), nullable=True),
        sa.Column("member_size_labels", sa.JSON(), nullable=True),
        sa.Column("sku", sa.String(length=120), nullable=True),
        sa.Column("source_country", sa.String(length=8), nullable=True),
        sa.Column("currency", sa.String(length=8), nullable=True),
        sa.Column("product_price", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("shipping_price", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("total_cost", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("delivery_days", sa.String(length=40), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["offer_group_id"],
            ["prodigi_storefront_offer_groups.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "offer_group_id",
            "slot_size_label",
            name="uq_prodigi_storefront_size_group_slot",
        ),
    )
    op.create_index(
        op.f("ix_prodigi_storefront_offer_sizes_offer_group_id"),
        "prodigi_storefront_offer_sizes",
        ["offer_group_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_prodigi_storefront_offer_sizes_slot_size_label"),
        "prodigi_storefront_offer_sizes",
        ["slot_size_label"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_prodigi_storefront_offer_sizes_slot_size_label"),
        table_name="prodigi_storefront_offer_sizes",
    )
    op.drop_index(
        op.f("ix_prodigi_storefront_offer_sizes_offer_group_id"),
        table_name="prodigi_storefront_offer_sizes",
    )
    op.drop_table("prodigi_storefront_offer_sizes")

    op.drop_index(
        op.f("ix_prodigi_storefront_offer_groups_tax_risk"),
        table_name="prodigi_storefront_offer_groups",
    )
    op.drop_index(
        op.f("ix_prodigi_storefront_offer_groups_storefront_action"),
        table_name="prodigi_storefront_offer_groups",
    )
    op.drop_index(
        op.f("ix_prodigi_storefront_offer_groups_ratio_label"),
        table_name="prodigi_storefront_offer_groups",
    )
    op.drop_index(
        op.f("ix_prodigi_storefront_offer_groups_geography_scope"),
        table_name="prodigi_storefront_offer_groups",
    )
    op.drop_index(
        op.f("ix_prodigi_storefront_offer_groups_fulfillment_level"),
        table_name="prodigi_storefront_offer_groups",
    )
    op.drop_index(
        op.f("ix_prodigi_storefront_offer_groups_destination_country"),
        table_name="prodigi_storefront_offer_groups",
    )
    op.drop_index(
        op.f("ix_prodigi_storefront_offer_groups_category_id"),
        table_name="prodigi_storefront_offer_groups",
    )
    op.drop_index(
        op.f("ix_prodigi_storefront_offer_groups_bake_id"),
        table_name="prodigi_storefront_offer_groups",
    )
    op.drop_table("prodigi_storefront_offer_groups")

    op.drop_index(
        op.f("ix_prodigi_storefront_bakes_paper_material"),
        table_name="prodigi_storefront_bakes",
    )
    op.drop_index(
        op.f("ix_prodigi_storefront_bakes_is_active"),
        table_name="prodigi_storefront_bakes",
    )
    op.drop_index(
        op.f("ix_prodigi_storefront_bakes_bake_key"),
        table_name="prodigi_storefront_bakes",
    )
    op.drop_table("prodigi_storefront_bakes")
