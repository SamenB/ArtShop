"""add checkout group to orders

Revision ID: a86c4e19f2d7
Revises: f3a2b1c9d840
Create Date: 2026-04-29 04:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a86c4e19f2d7"
down_revision: Union[str, None] = "f3a2b1c9d840"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("orders", sa.Column("checkout_group_id", sa.String(length=36), nullable=True))
    op.add_column("orders", sa.Column("checkout_segment", sa.String(length=20), nullable=True))
    op.create_index("ix_orders_checkout_group_id", "orders", ["checkout_group_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_orders_checkout_group_id", table_name="orders")
    op.drop_column("orders", "checkout_segment")
    op.drop_column("orders", "checkout_group_id")
