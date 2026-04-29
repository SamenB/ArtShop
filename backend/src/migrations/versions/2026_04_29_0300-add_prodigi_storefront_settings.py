"""add prodigi storefront settings

Revision ID: f3a2b1c9d840
Revises: b7d0ac4f9312
Create Date: 2026-04-29 03:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f3a2b1c9d840"
down_revision: Union[str, None] = "b7d0ac4f9312"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "prodigi_storefront_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("shipping_policy", sa.JSON(), nullable=False),
        sa.Column("category_policy", sa.JSON(), nullable=False),
        sa.Column("snapshot_defaults", sa.JSON(), nullable=False),
        sa.Column("payload_policy_version", sa.String(length=120), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("prodigi_storefront_settings")
