"""
Migration: Add limited edition quantity fields to artworks.

Changes:
  artworks table:
    - ADD: canvas_print_limited_quantity (INTEGER, nullable)
    - ADD: paper_print_limited_quantity  (INTEGER, nullable)

These fields store the total number of prints in the numbered limited series
(e.g. 30 means the edition is X/30). Only meaningful when the corresponding
has_canvas_print_limited / has_paper_print_limited flag is True.
"""

import sqlalchemy as sa
from alembic import op

revision = "2026_04_17_limited_edition_qty"
down_revision = "2026_04_17_print_types"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "artworks",
        sa.Column("canvas_print_limited_quantity", sa.Integer(), nullable=True),
    )
    op.add_column(
        "artworks",
        sa.Column("paper_print_limited_quantity", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("artworks", "paper_print_limited_quantity")
    op.drop_column("artworks", "canvas_print_limited_quantity")
