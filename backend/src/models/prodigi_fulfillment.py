from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from src.database import Base


class ProdigiFulfillmentJobOrm(Base):
    __tablename__ = "prodigi_fulfillment_jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("orders.id", ondelete="CASCADE"),
        index=True,
    )
    provider_key: Mapped[str] = mapped_column(
        String(40), default="prodigi", server_default="prodigi"
    )
    status: Mapped[str] = mapped_column(
        String(40), default="pending", server_default="pending", index=True
    )
    mode: Mapped[str] = mapped_column(String(20), default="sandbox", server_default="sandbox")
    merchant_reference: Mapped[str] = mapped_column(String(160), index=True)
    idempotency_key: Mapped[str] = mapped_column(String(180), unique=True, index=True)
    prodigi_order_id: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    attempt_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    item_ids: Mapped[list[int]] = mapped_column(JSON, nullable=False)
    payload_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now(),
        onupdate=func.now(),
    )


class ProdigiFulfillmentEventOrm(Base):
    __tablename__ = "prodigi_fulfillment_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    job_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("prodigi_fulfillment_jobs.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    order_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("orders.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    order_item_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("order_items.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    user_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    event_type: Mapped[str] = mapped_column(String(80), index=True)
    stage: Mapped[str] = mapped_column(String(80), index=True)
    status: Mapped[str] = mapped_column(String(40), index=True)
    external_id: Mapped[str | None] = mapped_column(String(160), nullable=True, index=True)
    request_payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    response_payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    metadata_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class ProdigiFulfillmentGateResultOrm(Base):
    __tablename__ = "prodigi_fulfillment_gate_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    job_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("prodigi_fulfillment_jobs.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    order_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("orders.id", ondelete="CASCADE"),
        index=True,
    )
    order_item_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("order_items.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    gate: Mapped[str] = mapped_column(String(80), index=True)
    status: Mapped[str] = mapped_column(String(30), index=True)
    measured: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    expected: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
