"""add artwork print profile fields

Revision ID: c31d5ab42ef0
Revises: f2c6a9d7b4e1
Create Date: 2026-04-22 12:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c31d5ab42ef0"
down_revision: Union[str, Sequence[str], None] = "f2c6a9d7b4e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("artworks", sa.Column("print_source_metadata", sa.JSON(), nullable=True))
    op.add_column("artworks", sa.Column("print_profile_overrides", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("artworks", "print_profile_overrides")
    op.drop_column("artworks", "print_source_metadata")
