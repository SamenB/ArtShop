"""replace is_original_available bool with original_status enum

Revision ID: 583beeb1585c
Revises: 13cd92a2ae61
Create Date: 2026-03-08 22:36:49.699554

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "583beeb1585c"
down_revision: Union[str, Sequence[str], None] = "13cd92a2ae61"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "artworks",
        sa.Column(
            "original_status",
            sa.String(20),
            server_default="available",
            nullable=False,
        ),
    )
    op.drop_column("artworks", "is_original_available")


def downgrade() -> None:
    """Downgrade schema."""
    op.add_column(
        "artworks",
        sa.Column(
            "is_original_available", sa.BOOLEAN(), server_default="true", autoincrement=False, nullable=False
        ),
    )
    op.drop_column("artworks", "original_status")

