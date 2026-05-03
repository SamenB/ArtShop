"""Add FAQ content and remove hero slideshow settings.

Revision ID: faq_content_static_hero
Revises: admin_visibility_content
Create Date: 2026-04-28 05:00:00
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "faq_content_static_hero"
down_revision: Union[str, Sequence[str], None] = "admin_visibility_content"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("site_settings", sa.Column("faq_page_text", sa.Text(), nullable=True))
    op.drop_column("site_settings", "hero_slide_duration")
    op.drop_column("site_settings", "hero_ken_burns_enabled")
    op.drop_column("site_settings", "cover_3_mobile_url")
    op.drop_column("site_settings", "cover_3_desktop_url")
    op.drop_column("site_settings", "cover_2_mobile_url")
    op.drop_column("site_settings", "cover_2_desktop_url")


def downgrade() -> None:
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
        sa.Column("hero_ken_burns_enabled", sa.Boolean(), server_default=sa.text("true")),
    )
    op.add_column(
        "site_settings",
        sa.Column("hero_slide_duration", sa.Integer(), server_default=sa.text("15")),
    )
    op.drop_column("site_settings", "faq_page_text")
