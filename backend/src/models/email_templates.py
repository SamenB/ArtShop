"""
SQLAlchemy model for email notification templates.

All customer-facing and admin-facing email content is stored here,
making it editable through the admin panel without code deployments.
"""

from sqlalchemy import Boolean, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from src.database import Base


class EmailTemplateOrm(Base):
    """
    Stores editable email templates for all transactional and automated notifications.

    Fields:
        key:              Unique identifier used by the code to look up the template.
                          Never changed after creation (it's the code contract).
        trigger_event:    Describes when this email fires — for display purposes only.
                          Format: "payment.paid" | "fulfillment.shipped" | "contact.submitted" etc.
        send_to_customer: True if the recipient is the customer, False if the site owner/admin.
        is_active:        If False, the email is suppressed entirely (useful for optional notifications).
        subject:          Email subject line. Supports {order_id}, {first_name} etc. placeholders.
        body:             Plain-text email body. Supports the same placeholders as subject.
        note:             Internal hint shown in the admin UI describing available placeholders.
    """

    __tablename__ = "email_templates"

    id: Mapped[int] = mapped_column(primary_key=True)
    key: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    trigger_event: Mapped[str] = mapped_column(String(100))
    send_to_customer: Mapped[bool] = mapped_column(Boolean, default=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    subject: Mapped[str] = mapped_column(String(300))
    body: Mapped[str] = mapped_column(Text)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    def __str__(self) -> str:
        return f"EmailTemplate({self.key})"
