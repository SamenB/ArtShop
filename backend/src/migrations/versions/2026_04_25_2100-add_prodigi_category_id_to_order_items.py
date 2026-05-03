"""add prodigi category fields to order items

Revision ID: 6c8f3a9d42af
Revises: 2fded7e4b1ac
Create Date: 2026-04-25 21:00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "6c8f3a9d42af"
down_revision: Union[str, Sequence[str], None] = "2fded7e4b1ac"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("order_items", sa.Column("prodigi_category_id", sa.String(length=80), nullable=True))
    op.add_column("order_items", sa.Column("prodigi_slot_size_label", sa.String(length=80), nullable=True))


def downgrade() -> None:
    op.drop_column("order_items", "prodigi_slot_size_label")
    op.drop_column("order_items", "prodigi_category_id")
