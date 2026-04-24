"""drop obsolete artwork size label columns

Revision ID: 2fded7e4b1ac
Revises: e6f9c2b7a104
Create Date: 2026-04-24 03:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "2fded7e4b1ac"
down_revision: Union[str, Sequence[str], None] = "e6f9c2b7a104"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("artworks", "print_max_size_label")
    op.drop_column("artworks", "print_min_size_label")


def downgrade() -> None:
    op.add_column(
        "artworks",
        sa.Column("print_min_size_label", sa.String(length=50), nullable=True),
    )
    op.add_column(
        "artworks",
        sa.Column("print_max_size_label", sa.String(length=50), nullable=True),
    )
