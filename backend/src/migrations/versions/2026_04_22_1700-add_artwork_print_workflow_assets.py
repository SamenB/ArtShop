"""add artwork print workflow assets

Revision ID: d8c8d9682e71
Revises: a91f4d2e6c10
Create Date: 2026-04-22 17:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "d8c8d9682e71"
down_revision: Union[str, Sequence[str], None] = "a91f4d2e6c10"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("artworks", sa.Column("print_workflow_config", sa.JSON(), nullable=True))

    op.create_table(
        "artwork_print_assets",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("artwork_id", sa.BigInteger(), nullable=False),
        sa.Column("provider_key", sa.String(length=40), nullable=False),
        sa.Column("category_id", sa.String(length=80), nullable=True),
        sa.Column("asset_role", sa.String(length=80), nullable=False),
        sa.Column("slot_size_label", sa.String(length=80), nullable=True),
        sa.Column("file_url", sa.String(length=1000), nullable=False),
        sa.Column("file_name", sa.String(length=255), nullable=True),
        sa.Column("file_ext", sa.String(length=20), nullable=True),
        sa.Column("mime_type", sa.String(length=120), nullable=True),
        sa.Column("file_size_bytes", sa.BigInteger(), nullable=True),
        sa.Column("checksum_sha256", sa.String(length=64), nullable=True),
        sa.Column("file_metadata", sa.JSON(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["artwork_id"], ["artworks.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "artwork_id",
            "provider_key",
            "category_id",
            "asset_role",
            "slot_size_label",
            name="uq_artwork_print_asset_scope",
        ),
    )

    op.create_index(
        op.f("ix_artwork_print_assets_artwork_id"),
        "artwork_print_assets",
        ["artwork_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_artwork_print_assets_provider_key"),
        "artwork_print_assets",
        ["provider_key"],
        unique=False,
    )
    op.create_index(
        op.f("ix_artwork_print_assets_category_id"),
        "artwork_print_assets",
        ["category_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_artwork_print_assets_asset_role"),
        "artwork_print_assets",
        ["asset_role"],
        unique=False,
    )
    op.create_index(
        op.f("ix_artwork_print_assets_slot_size_label"),
        "artwork_print_assets",
        ["slot_size_label"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_artwork_print_assets_slot_size_label"), table_name="artwork_print_assets")
    op.drop_index(op.f("ix_artwork_print_assets_asset_role"), table_name="artwork_print_assets")
    op.drop_index(op.f("ix_artwork_print_assets_category_id"), table_name="artwork_print_assets")
    op.drop_index(op.f("ix_artwork_print_assets_provider_key"), table_name="artwork_print_assets")
    op.drop_index(op.f("ix_artwork_print_assets_artwork_id"), table_name="artwork_print_assets")
    op.drop_table("artwork_print_assets")
    op.drop_column("artworks", "print_workflow_config")
