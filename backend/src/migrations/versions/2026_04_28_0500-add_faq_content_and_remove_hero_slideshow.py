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


def _has_column(table_name: str, column_name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return any(column["name"] == column_name for column in inspector.get_columns(table_name))


def _add_column_if_missing(table_name: str, column: sa.Column) -> None:
    if not _has_column(table_name, column.name):
        op.add_column(table_name, column)


def _drop_column_if_exists(table_name: str, column_name: str) -> None:
    if _has_column(table_name, column_name):
        op.drop_column(table_name, column_name)


def upgrade() -> None:
    _add_column_if_missing("site_settings", sa.Column("faq_page_text", sa.Text(), nullable=True))
    for column_name in (
        "hero_slide_duration",
        "hero_ken_burns_enabled",
        "cover_3_mobile_url",
        "cover_3_desktop_url",
        "cover_2_mobile_url",
        "cover_2_desktop_url",
    ):
        _drop_column_if_exists("site_settings", column_name)


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
