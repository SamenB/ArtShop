"""Add artwork visibility and editable content pages.

Revision ID: admin_visibility_content
Revises: fix_artwork_cascade_fks
Create Date: 2026-04-28 04:00:00
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "admin_visibility_content"
down_revision: Union[str, Sequence[str], None] = "fix_artwork_cascade_fks"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "artworks",
        sa.Column("show_in_gallery", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.add_column(
        "artworks",
        sa.Column("show_in_shop", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.add_column("site_settings", sa.Column("shipping_page_text", sa.Text(), nullable=True))
    op.add_column("site_settings", sa.Column("terms_page_text", sa.Text(), nullable=True))
    op.add_column("site_settings", sa.Column("privacy_page_text", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("site_settings", "privacy_page_text")
    op.drop_column("site_settings", "terms_page_text")
    op.drop_column("site_settings", "shipping_page_text")
    op.drop_column("artworks", "show_in_shop")
    op.drop_column("artworks", "show_in_gallery")
