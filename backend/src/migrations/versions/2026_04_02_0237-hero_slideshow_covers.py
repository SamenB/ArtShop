"""hero_slideshow_covers

Revision ID: hero_slideshow_covers
Revises: deb9e26c9c6a
Create Date: 2026-04-02 02:37:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "hero_slideshow_covers"
down_revision: Union[str, Sequence[str], None] = "deb9e26c9c6a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add cover 2 & 3 columns for hero slideshow."""
    op.add_column(
        "site_settings",
        sa.Column("cover_2_desktop_url", sa.String(length=500), nullable=True),
    )
    op.add_column(
        "site_settings",
        sa.Column("cover_2_mobile_url", sa.String(length=500), nullable=True),
    )
    op.add_column(
        "site_settings",
        sa.Column("cover_3_desktop_url", sa.String(length=500), nullable=True),
    )
    op.add_column(
        "site_settings",
        sa.Column("cover_3_mobile_url", sa.String(length=500), nullable=True),
    )
    op.add_column(
        "site_settings",
        sa.Column("hero_ken_burns_enabled", sa.Boolean(), server_default=sa.text("true"), nullable=False),
    )


def downgrade() -> None:
    """Remove cover 2 & 3 columns and ken burns flag."""
    op.drop_column("site_settings", "hero_ken_burns_enabled")
    op.drop_column("site_settings", "cover_3_mobile_url")
    op.drop_column("site_settings", "cover_3_desktop_url")
    op.drop_column("site_settings", "cover_2_mobile_url")
    op.drop_column("site_settings", "cover_2_desktop_url")
