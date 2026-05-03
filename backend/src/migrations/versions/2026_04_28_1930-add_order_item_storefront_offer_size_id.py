"""add order item storefront offer size id

Revision ID: b22d7a8c91f0
Revises: 7b4d91e2c8aa
Create Date: 2026-04-28 19:30:00
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "b22d7a8c91f0"
down_revision: Union[str, Sequence[str], None] = "7b4d91e2c8aa"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "order_items",
        sa.Column("prodigi_storefront_offer_size_id", sa.Integer(), nullable=True),
    )
    op.create_index(
        "ix_order_items_prodigi_storefront_offer_size_id",
        "order_items",
        ["prodigi_storefront_offer_size_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_order_items_prodigi_storefront_offer_size_id", table_name="order_items")
    op.drop_column("order_items", "prodigi_storefront_offer_size_id")
