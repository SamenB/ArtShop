"""add order economics fields

Revision ID: b7d0ac4f9312
Revises: a9f08b8d1e42
Create Date: 2026-04-29 02:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b7d0ac4f9312"
down_revision: Union[str, None] = "a9f08b8d1e42"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("orders", sa.Column("subtotal_price", sa.Integer(), nullable=True))
    op.add_column("orders", sa.Column("shipping_price", sa.Integer(), nullable=True))
    op.add_column("orders", sa.Column("discount_price", sa.Integer(), nullable=True))

    op.add_column("order_items", sa.Column("customer_product_price", sa.Float(), nullable=True))
    op.add_column("order_items", sa.Column("customer_shipping_price", sa.Float(), nullable=True))
    op.add_column("order_items", sa.Column("customer_line_total", sa.Float(), nullable=True))
    op.add_column("order_items", sa.Column("customer_currency", sa.String(length=3), nullable=True))
    op.add_column("order_items", sa.Column("prodigi_storefront_bake_id", sa.Integer(), nullable=True))
    op.add_column(
        "order_items",
        sa.Column("prodigi_storefront_policy_version", sa.String(length=80), nullable=True),
    )
    op.add_column("order_items", sa.Column("prodigi_shipping_tier", sa.String(length=50), nullable=True))
    op.add_column("order_items", sa.Column("prodigi_delivery_days", sa.String(length=40), nullable=True))
    op.add_column("order_items", sa.Column("prodigi_supplier_total_eur", sa.Float(), nullable=True))
    op.add_column("order_items", sa.Column("prodigi_supplier_currency", sa.String(length=3), nullable=True))


def downgrade() -> None:
    op.drop_column("order_items", "prodigi_supplier_currency")
    op.drop_column("order_items", "prodigi_supplier_total_eur")
    op.drop_column("order_items", "prodigi_delivery_days")
    op.drop_column("order_items", "prodigi_shipping_tier")
    op.drop_column("order_items", "prodigi_storefront_policy_version")
    op.drop_column("order_items", "prodigi_storefront_bake_id")
    op.drop_column("order_items", "customer_currency")
    op.drop_column("order_items", "customer_line_total")
    op.drop_column("order_items", "customer_shipping_price")
    op.drop_column("order_items", "customer_product_price")

    op.drop_column("orders", "discount_price")
    op.drop_column("orders", "shipping_price")
    op.drop_column("orders", "subtotal_price")
