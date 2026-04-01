"""add category to tags

Revision ID: add_tag_category_2026
Revises: 1b7721431365
Create Date: 2026-04-01 22:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'add_tag_category_2026'
down_revision: Union[str, None] = '1b7721431365'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('tags', sa.Column('category', sa.String(50), nullable=True))


def downgrade() -> None:
    op.drop_column('tags', 'category')
