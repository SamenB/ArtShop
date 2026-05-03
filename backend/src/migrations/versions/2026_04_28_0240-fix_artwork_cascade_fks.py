"""Fix artwork cascade FK constraints for deep deletion.

- user_likes.artwork_id: add ON DELETE CASCADE
- order_items.artwork_id: make nullable, add ON DELETE SET NULL

Revision ID: fix_artwork_cascade_fks
Revises: 391a33c67852
Create Date: 2026-04-28 02:40:00
"""

import sqlalchemy as sa
from alembic import op

revision = "fix_artwork_cascade_fks"
down_revision = "391a33c67852"
branch_labels = None
depends_on = None


def _foreign_keys_for_column(table_name: str, column_name: str) -> list[str]:
    inspector = sa.inspect(op.get_bind())
    names: list[str] = []
    for foreign_key in inspector.get_foreign_keys(table_name):
        if column_name in foreign_key.get("constrained_columns", []):
            name = foreign_key.get("name")
            if name:
                names.append(name)
    return names


def _drop_foreign_keys_for_column(table_name: str, column_name: str) -> None:
    for constraint_name in _foreign_keys_for_column(table_name, column_name):
        op.drop_constraint(constraint_name, table_name, type_="foreignkey")


def upgrade() -> None:
    # ── user_likes.artwork_id: add ON DELETE CASCADE ──────────────────────
    _drop_foreign_keys_for_column("user_likes", "artwork_id")
    op.create_foreign_key(
        "user_likes_artwork_id_fkey",
        "user_likes",
        "artworks",
        ["artwork_id"],
        ["id"],
        ondelete="CASCADE",
    )

    # ── order_items.artwork_id: nullable + ON DELETE SET NULL ─────────────
    op.alter_column(
        "order_items",
        "artwork_id",
        existing_type=sa.Integer(),
        nullable=True,
    )
    _drop_foreign_keys_for_column("order_items", "artwork_id")
    op.create_foreign_key(
        "order_items_artwork_id_fkey",
        "order_items",
        "artworks",
        ["artwork_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    # ── Revert order_items.artwork_id ─────────────────────────────────────
    _drop_foreign_keys_for_column("order_items", "artwork_id")
    op.create_foreign_key(
        "order_items_artwork_id_fkey",
        "order_items",
        "artworks",
        ["artwork_id"],
        ["id"],
    )
    op.alter_column(
        "order_items",
        "artwork_id",
        existing_type=sa.Integer(),
        nullable=False,
    )

    # ── Revert user_likes.artwork_id ──────────────────────────────────────
    _drop_foreign_keys_for_column("user_likes", "artwork_id")
    op.create_foreign_key(
        "user_likes_artwork_id_fkey",
        "user_likes",
        "artworks",
        ["artwork_id"],
        ["id"],
    )
