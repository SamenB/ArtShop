"""add admin profile settings

Revision ID: cbe1d59f7b6a
Revises: 2f8a0d9c74b1
Create Date: 2026-04-28 21:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "cbe1d59f7b6a"
down_revision: Union[str, None] = "2f8a0d9c74b1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("site_settings", sa.Column("owner_name", sa.String(length=200), nullable=True))
    op.add_column("site_settings", sa.Column("owner_email", sa.String(length=200), nullable=True))
    op.add_column("site_settings", sa.Column("owner_phone", sa.String(length=80), nullable=True))
    op.add_column(
        "site_settings",
        sa.Column("owner_telegram_chat_id", sa.String(length=120), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("site_settings", "owner_telegram_chat_id")
    op.drop_column("site_settings", "owner_phone")
    op.drop_column("site_settings", "owner_email")
    op.drop_column("site_settings", "owner_name")
