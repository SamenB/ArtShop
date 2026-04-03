"""add_hero_slide_duration

Revision ID: add_slide_duration
Revises: add_ken_burns_flag
Create Date: 2026-04-02 02:57:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "add_slide_duration"
down_revision: Union[str, Sequence[str], None] = "add_ken_burns_flag"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "site_settings",
        sa.Column("hero_slide_duration", sa.Integer(), server_default=sa.text("15"), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("site_settings", "hero_slide_duration")
