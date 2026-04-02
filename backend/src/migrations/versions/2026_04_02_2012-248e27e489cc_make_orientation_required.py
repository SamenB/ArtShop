"""make_orientation_required

Revision ID: 248e27e489cc
Revises: 30f520bafda1
Create Date: 2026-04-02 20:12:39.646547

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "248e27e489cc"
down_revision: Union[str, Sequence[str], None] = "30f520bafda1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Set default values for existing rows
    op.execute("UPDATE artworks SET orientation = 'vertical' WHERE orientation IS NULL")
    # Make the column not nullable
    op.alter_column('artworks', 'orientation',
               existing_type=sa.String(length=20),
               nullable=False)


def downgrade() -> None:
    """Downgrade schema."""
    # Make the column nullable again
    op.alter_column('artworks', 'orientation',
               existing_type=sa.String(length=20),
               nullable=True)
