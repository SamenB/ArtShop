"""add fulfillment lifecycle fields to orders

Revision ID: a1b2c3d4e5f6
Revises: 265837a4c028
Create Date: 2026-04-15 18:41:00

Adds:
- fulfillment_status: tracks the physical order pipeline
- notes: internal admin-only notes per order
- tracking_number, carrier, tracking_url: shipping tracking info
- confirmed_at, print_ordered_at, print_received_at, shipped_at, delivered_at: auto-set timestamps
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = "a1b2c3d4e5f6"
down_revision = "8df4b739076d"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # fulfillment_status column
    op.add_column(
        "orders",
        sa.Column(
            "fulfillment_status",
            sa.String(30),
            nullable=False,
            server_default="pending",
        ),
    )

    # Internal admin notes
    op.add_column(
        "orders",
        sa.Column("notes", sa.String(2000), nullable=True),
    )

    # Shipping tracking fields
    op.add_column(
        "orders",
        sa.Column("tracking_number", sa.String(200), nullable=True),
    )
    op.add_column(
        "orders",
        sa.Column("carrier", sa.String(100), nullable=True),
    )
    op.add_column(
        "orders",
        sa.Column("tracking_url", sa.String(500), nullable=True),
    )

    # Lifecycle timestamps — auto-set by service layer when status changes
    op.add_column(
        "orders",
        sa.Column("confirmed_at", sa.DateTime(), nullable=True),
    )
    op.add_column(
        "orders",
        sa.Column("print_ordered_at", sa.DateTime(), nullable=True),
    )
    op.add_column(
        "orders",
        sa.Column("print_received_at", sa.DateTime(), nullable=True),
    )
    op.add_column(
        "orders",
        sa.Column("shipped_at", sa.DateTime(), nullable=True),
    )
    op.add_column(
        "orders",
        sa.Column("delivered_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("orders", "delivered_at")
    op.drop_column("orders", "shipped_at")
    op.drop_column("orders", "print_received_at")
    op.drop_column("orders", "print_ordered_at")
    op.drop_column("orders", "confirmed_at")
    op.drop_column("orders", "tracking_url")
    op.drop_column("orders", "carrier")
    op.drop_column("orders", "tracking_number")
    op.drop_column("orders", "notes")
    op.drop_column("orders", "fulfillment_status")
