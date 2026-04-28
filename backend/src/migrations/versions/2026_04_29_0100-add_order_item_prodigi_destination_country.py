"""add order item prodigi destination country

Revision ID: a9f08b8d1e42
Revises: cbe1d59f7b6a
Create Date: 2026-04-29 01:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a9f08b8d1e42"
down_revision: Union[str, None] = "cbe1d59f7b6a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "order_items",
        sa.Column("prodigi_destination_country_code", sa.String(length=2), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("order_items", "prodigi_destination_country_code")
