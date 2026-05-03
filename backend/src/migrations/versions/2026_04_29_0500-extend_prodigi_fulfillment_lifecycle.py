"""extend prodigi fulfillment lifecycle

Revision ID: c4a5f6b7d890
Revises: a86c4e19f2d7
Create Date: 2026-04-29 05:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c4a5f6b7d890"
down_revision: Union[str, None] = "a86c4e19f2d7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "order_items", sa.Column("prodigi_order_item_id", sa.String(length=120), nullable=True)
    )
    op.add_column(
        "order_items", sa.Column("prodigi_asset_id", sa.String(length=120), nullable=True)
    )

    op.add_column(
        "prodigi_fulfillment_jobs", sa.Column("request_payload", sa.JSON(), nullable=True)
    )
    op.add_column(
        "prodigi_fulfillment_jobs", sa.Column("response_payload", sa.JSON(), nullable=True)
    )
    op.add_column(
        "prodigi_fulfillment_jobs",
        sa.Column("latest_status_payload", sa.JSON(), nullable=True),
    )
    op.add_column(
        "prodigi_fulfillment_jobs", sa.Column("trace_parent", sa.String(length=200), nullable=True)
    )
    op.add_column(
        "prodigi_fulfillment_jobs", sa.Column("submitted_at", sa.DateTime(), nullable=True)
    )
    op.add_column(
        "prodigi_fulfillment_jobs", sa.Column("status_stage", sa.String(length=80), nullable=True)
    )
    op.add_column("prodigi_fulfillment_jobs", sa.Column("status_details", sa.JSON(), nullable=True))
    op.add_column("prodigi_fulfillment_jobs", sa.Column("issues", sa.JSON(), nullable=True))
    op.add_column(
        "prodigi_fulfillment_jobs",
        sa.Column("submission_revision", sa.Integer(), server_default="1", nullable=False),
    )
    op.create_index(
        "ix_prodigi_fulfillment_jobs_status_stage",
        "prodigi_fulfillment_jobs",
        ["status_stage"],
        unique=False,
    )

    op.add_column(
        "prodigi_fulfillment_events", sa.Column("event_uid", sa.String(length=160), nullable=True)
    )
    op.create_index(
        "ix_prodigi_fulfillment_events_event_uid",
        "prodigi_fulfillment_events",
        ["event_uid"],
        unique=False,
    )
    op.create_unique_constraint(
        "uq_prodigi_fulfillment_events_event_uid",
        "prodigi_fulfillment_events",
        ["event_uid"],
    )

    op.create_table(
        "prodigi_fulfillment_shipments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("job_id", sa.Integer(), nullable=True),
        sa.Column("order_id", sa.Integer(), nullable=True),
        sa.Column("prodigi_order_id", sa.String(length=120), nullable=True),
        sa.Column("prodigi_shipment_id", sa.String(length=160), nullable=False),
        sa.Column("status", sa.String(length=80), nullable=True),
        sa.Column("carrier", sa.String(length=120), nullable=True),
        sa.Column("tracking_number", sa.String(length=200), nullable=True),
        sa.Column("tracking_url", sa.String(length=500), nullable=True),
        sa.Column("payload", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["job_id"], ["prodigi_fulfillment_jobs.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "prodigi_shipment_id",
            name="uq_prodigi_fulfillment_shipments_prodigi_shipment_id",
        ),
    )
    op.create_index("ix_prodigi_shipments_job_id", "prodigi_fulfillment_shipments", ["job_id"])
    op.create_index("ix_prodigi_shipments_order_id", "prodigi_fulfillment_shipments", ["order_id"])
    op.create_index(
        "ix_prodigi_shipments_prodigi_order_id",
        "prodigi_fulfillment_shipments",
        ["prodigi_order_id"],
    )
    op.create_index(
        "ix_prodigi_shipments_prodigi_shipment_id",
        "prodigi_fulfillment_shipments",
        ["prodigi_shipment_id"],
    )


def downgrade() -> None:
    op.drop_table("prodigi_fulfillment_shipments")
    op.drop_constraint(
        "uq_prodigi_fulfillment_events_event_uid",
        "prodigi_fulfillment_events",
        type_="unique",
    )
    op.drop_index(
        "ix_prodigi_fulfillment_events_event_uid",
        table_name="prodigi_fulfillment_events",
    )
    op.drop_column("prodigi_fulfillment_events", "event_uid")
    op.drop_index(
        "ix_prodigi_fulfillment_jobs_status_stage",
        table_name="prodigi_fulfillment_jobs",
    )
    op.drop_column("prodigi_fulfillment_jobs", "submission_revision")
    op.drop_column("prodigi_fulfillment_jobs", "issues")
    op.drop_column("prodigi_fulfillment_jobs", "status_details")
    op.drop_column("prodigi_fulfillment_jobs", "status_stage")
    op.drop_column("prodigi_fulfillment_jobs", "submitted_at")
    op.drop_column("prodigi_fulfillment_jobs", "trace_parent")
    op.drop_column("prodigi_fulfillment_jobs", "latest_status_payload")
    op.drop_column("prodigi_fulfillment_jobs", "response_payload")
    op.drop_column("prodigi_fulfillment_jobs", "request_payload")
    op.drop_column("order_items", "prodigi_asset_id")
    op.drop_column("order_items", "prodigi_order_item_id")
