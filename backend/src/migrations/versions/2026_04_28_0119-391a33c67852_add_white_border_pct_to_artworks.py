"""add_white_border_pct_to_artworks

Revision ID: 391a33c67852
Revises: 6c8f3a9d42af
Create Date: 2026-04-28 01:19:01.122919

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "391a33c67852"
down_revision: Union[str, Sequence[str], None] = "6c8f3a9d42af"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "artworks",
        sa.Column("white_border_pct", sa.Float(), server_default="5.0", nullable=False),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("artworks", "white_border_pct")
