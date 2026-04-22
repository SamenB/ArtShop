"""add materialized artwork storefront payloads

Revision ID: a91f4d2e6c10
Revises: c31d5ab42ef0
Create Date: 2026-04-22 13:30:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "a91f4d2e6c10"
down_revision: Union[str, Sequence[str], None] = "c31d5ab42ef0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "prodigi_artwork_storefront_payloads",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("bake_id", sa.Integer(), nullable=False),
        sa.Column("artwork_id", sa.BigInteger(), nullable=False),
        sa.Column("country_code", sa.String(length=8), nullable=False),
        sa.Column("country_name", sa.String(length=120), nullable=True),
        sa.Column(
            "print_country_supported",
            sa.Boolean(),
            server_default="false",
            nullable=False,
        ),
        sa.Column("default_medium", sa.String(length=20), nullable=True),
        sa.Column("min_print_price", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("summary", sa.JSON(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["artwork_id"],
            ["artworks.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["bake_id"],
            ["prodigi_storefront_bakes.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "bake_id",
            "artwork_id",
            "country_code",
            name="uq_prodigi_artwork_storefront_payload_bake_artwork_country",
        ),
    )
    op.create_index(
        op.f("ix_prodigi_artwork_storefront_payloads_artwork_id"),
        "prodigi_artwork_storefront_payloads",
        ["artwork_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_prodigi_artwork_storefront_payloads_bake_id"),
        "prodigi_artwork_storefront_payloads",
        ["bake_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_prodigi_artwork_storefront_payloads_country_code"),
        "prodigi_artwork_storefront_payloads",
        ["country_code"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_prodigi_artwork_storefront_payloads_country_code"),
        table_name="prodigi_artwork_storefront_payloads",
    )
    op.drop_index(
        op.f("ix_prodigi_artwork_storefront_payloads_bake_id"),
        table_name="prodigi_artwork_storefront_payloads",
    )
    op.drop_index(
        op.f("ix_prodigi_artwork_storefront_payloads_artwork_id"),
        table_name="prodigi_artwork_storefront_payloads",
    )
    op.drop_table("prodigi_artwork_storefront_payloads")
