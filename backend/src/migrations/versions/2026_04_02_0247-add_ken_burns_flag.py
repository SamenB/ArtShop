"""add_hero_ken_burns_enabled

Revision ID: add_ken_burns_flag
Revises: hero_slideshow_covers
Create Date: 2026-04-02 02:47:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "add_ken_burns_flag"
down_revision: Union[str, Sequence[str], None] = "hero_slideshow_covers"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "site_settings",
        sa.Column("hero_ken_burns_enabled", sa.Boolean(), server_default=sa.text("true"), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("site_settings", "hero_ken_burns_enabled")
