"""add prodigi fulfillment mode setting

Revision ID: 2f8a0d9c74b1
Revises: b22d7a8c91f0
Create Date: 2026-04-28 20:30:00
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "2f8a0d9c74b1"
down_revision: Union[str, Sequence[str], None] = "b22d7a8c91f0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "site_settings",
        sa.Column(
            "prodigi_fulfillment_mode",
            sa.String(length=20),
            server_default="automatic",
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("site_settings", "prodigi_fulfillment_mode")
