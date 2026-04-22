"""add storefront shipping profiles

Revision ID: f2c6a9d7b4e1
Revises: b7a4f2c913ab
Create Date: 2026-04-21 23:30:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f2c6a9d7b4e1"
down_revision: Union[str, Sequence[str], None] = "b7a4f2c913ab"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "prodigi_storefront_offer_groups",
        sa.Column("available_shipping_tiers", sa.JSON(), nullable=True),
    )
    op.add_column(
        "prodigi_storefront_offer_groups",
        sa.Column("default_shipping_tier", sa.String(length=40), nullable=True),
    )

    op.add_column(
        "prodigi_storefront_offer_sizes",
        sa.Column("default_shipping_tier", sa.String(length=40), nullable=True),
    )
    op.add_column(
        "prodigi_storefront_offer_sizes",
        sa.Column("shipping_method", sa.String(length=80), nullable=True),
    )
    op.add_column(
        "prodigi_storefront_offer_sizes",
        sa.Column("service_name", sa.String(length=160), nullable=True),
    )
    op.add_column(
        "prodigi_storefront_offer_sizes",
        sa.Column("service_level", sa.String(length=80), nullable=True),
    )
    op.add_column(
        "prodigi_storefront_offer_sizes",
        sa.Column("shipping_profiles", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("prodigi_storefront_offer_sizes", "shipping_profiles")
    op.drop_column("prodigi_storefront_offer_sizes", "service_level")
    op.drop_column("prodigi_storefront_offer_sizes", "service_name")
    op.drop_column("prodigi_storefront_offer_sizes", "shipping_method")
    op.drop_column("prodigi_storefront_offer_sizes", "default_shipping_tier")

    op.drop_column("prodigi_storefront_offer_groups", "default_shipping_tier")
    op.drop_column("prodigi_storefront_offer_groups", "available_shipping_tiers")
