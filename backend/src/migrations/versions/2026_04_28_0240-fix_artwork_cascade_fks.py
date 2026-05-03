"""Fix artwork cascade FK constraints for deep deletion.

- user_likes.artwork_id: add ON DELETE CASCADE
- order_items.artwork_id: make nullable, add ON DELETE SET NULL

Revision ID: fix_artwork_cascade_fks
Revises: 391a33c67852
Create Date: 2026-04-28 02:40:00
"""

from alembic import op
import sqlalchemy as sa

revision = "fix_artwork_cascade_fks"
down_revision = "391a33c67852"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── user_likes.artwork_id: add ON DELETE CASCADE ──────────────────────
    op.drop_constraint(
        "user_likes_artwork_id_fkey", "user_likes", type_="foreignkey"
    )
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
    op.drop_constraint(
        "order_items_artwork_id_fkey", "order_items", type_="foreignkey"
    )
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
    op.drop_constraint(
        "order_items_artwork_id_fkey", "order_items", type_="foreignkey"
    )
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
    op.drop_constraint(
        "user_likes_artwork_id_fkey", "user_likes", type_="foreignkey"
    )
    op.create_foreign_key(
        "user_likes_artwork_id_fkey",
        "user_likes",
        "artworks",
        ["artwork_id"],
        ["id"],
    )
