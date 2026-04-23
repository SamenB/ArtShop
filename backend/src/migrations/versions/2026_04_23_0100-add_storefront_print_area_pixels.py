"""add storefront print area pixels

Revision ID: e6f9c2b7a104
Revises: d8c8d9682e71
Create Date: 2026-04-23 01:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "e6f9c2b7a104"
down_revision: Union[str, Sequence[str], None] = "d8c8d9682e71"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "prodigi_storefront_offer_sizes",
        sa.Column("supplier_size_cm", sa.String(length=80), nullable=True),
    )
    op.add_column(
        "prodigi_storefront_offer_sizes",
        sa.Column("supplier_size_inches", sa.String(length=80), nullable=True),
    )
    op.add_column(
        "prodigi_storefront_offer_sizes",
        sa.Column("print_area_width_px", sa.Integer(), nullable=True),
    )
    op.add_column(
        "prodigi_storefront_offer_sizes",
        sa.Column("print_area_height_px", sa.Integer(), nullable=True),
    )
    op.add_column(
        "prodigi_storefront_offer_sizes",
        sa.Column("print_area_name", sa.String(length=80), nullable=True),
    )
    op.add_column(
        "prodigi_storefront_offer_sizes",
        sa.Column("print_area_source", sa.String(length=80), nullable=True),
    )
    op.add_column(
        "prodigi_storefront_offer_sizes",
        sa.Column("print_area_dimensions", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("prodigi_storefront_offer_sizes", "print_area_dimensions")
    op.drop_column("prodigi_storefront_offer_sizes", "print_area_source")
    op.drop_column("prodigi_storefront_offer_sizes", "print_area_name")
    op.drop_column("prodigi_storefront_offer_sizes", "print_area_height_px")
    op.drop_column("prodigi_storefront_offer_sizes", "print_area_width_px")
    op.drop_column("prodigi_storefront_offer_sizes", "supplier_size_inches")
    op.drop_column("prodigi_storefront_offer_sizes", "supplier_size_cm")
