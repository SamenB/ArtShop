"""add prodigi fulfillment audit tables

Revision ID: 7b4d91e2c8aa
Revises: add_pricing_regions
Create Date: 2026-04-28 19:00:00
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "7b4d91e2c8aa"
down_revision: Union[str, Sequence[str], None] = "add_pricing_regions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "prodigi_fulfillment_jobs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("provider_key", sa.String(length=40), server_default="prodigi", nullable=False),
        sa.Column("status", sa.String(length=40), server_default="pending", nullable=False),
        sa.Column("mode", sa.String(length=20), server_default="sandbox", nullable=False),
        sa.Column("merchant_reference", sa.String(length=160), nullable=False),
        sa.Column("idempotency_key", sa.String(length=180), nullable=False),
        sa.Column("prodigi_order_id", sa.String(length=120), nullable=True),
        sa.Column("attempt_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("item_ids", sa.JSON(), nullable=False),
        sa.Column("payload_hash", sa.String(length=128), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_prodigi_jobs_order_id", "prodigi_fulfillment_jobs", ["order_id"])
    op.create_index("ix_prodigi_jobs_status", "prodigi_fulfillment_jobs", ["status"])
    op.create_index(
        "ix_prodigi_jobs_idempotency_key",
        "prodigi_fulfillment_jobs",
        ["idempotency_key"],
        unique=True,
    )
    op.create_index("ix_prodigi_jobs_prodigi_order_id", "prodigi_fulfillment_jobs", ["prodigi_order_id"])
    op.create_index("ix_prodigi_jobs_merchant_reference", "prodigi_fulfillment_jobs", ["merchant_reference"])

    op.create_table(
        "prodigi_fulfillment_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("job_id", sa.Integer(), nullable=True),
        sa.Column("order_id", sa.Integer(), nullable=True),
        sa.Column("order_item_id", sa.Integer(), nullable=True),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("event_type", sa.String(length=80), nullable=False),
        sa.Column("stage", sa.String(length=80), nullable=False),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("external_id", sa.String(length=160), nullable=True),
        sa.Column("request_payload", sa.JSON(), nullable=True),
        sa.Column("response_payload", sa.JSON(), nullable=True),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["job_id"], ["prodigi_fulfillment_jobs.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["order_item_id"], ["order_items.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_prodigi_events_job_id", "prodigi_fulfillment_events", ["job_id"])
    op.create_index("ix_prodigi_events_order_id", "prodigi_fulfillment_events", ["order_id"])
    op.create_index("ix_prodigi_events_order_item_id", "prodigi_fulfillment_events", ["order_item_id"])
    op.create_index("ix_prodigi_events_user_id", "prodigi_fulfillment_events", ["user_id"])
    op.create_index("ix_prodigi_events_event_type", "prodigi_fulfillment_events", ["event_type"])
    op.create_index("ix_prodigi_events_stage", "prodigi_fulfillment_events", ["stage"])
    op.create_index("ix_prodigi_events_status", "prodigi_fulfillment_events", ["status"])
    op.create_index("ix_prodigi_events_external_id", "prodigi_fulfillment_events", ["external_id"])

    op.create_table(
        "prodigi_fulfillment_gate_results",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("job_id", sa.Integer(), nullable=True),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("order_item_id", sa.Integer(), nullable=True),
        sa.Column("gate", sa.String(length=80), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("measured", sa.JSON(), nullable=True),
        sa.Column("expected", sa.JSON(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["job_id"], ["prodigi_fulfillment_jobs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["order_item_id"], ["order_items.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_prodigi_gates_job_id", "prodigi_fulfillment_gate_results", ["job_id"])
    op.create_index("ix_prodigi_gates_order_id", "prodigi_fulfillment_gate_results", ["order_id"])
    op.create_index("ix_prodigi_gates_order_item_id", "prodigi_fulfillment_gate_results", ["order_item_id"])
    op.create_index("ix_prodigi_gates_gate", "prodigi_fulfillment_gate_results", ["gate"])
    op.create_index("ix_prodigi_gates_status", "prodigi_fulfillment_gate_results", ["status"])


def downgrade() -> None:
    op.drop_table("prodigi_fulfillment_gate_results")
    op.drop_table("prodigi_fulfillment_events")
    op.drop_table("prodigi_fulfillment_jobs")
