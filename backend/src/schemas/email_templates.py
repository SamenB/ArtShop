"""
Pydantic schemas for email template data validation and serialization.
"""

from typing import Optional

from pydantic import BaseModel, Field


class EmailTemplate(BaseModel):
    """
    Represents a full email template as stored in the database.
    """

    id: int
    key: str = Field(description="Unique code key — never changes after seeding")
    trigger_event: str = Field(description="Human-readable event name, for display only")
    send_to_customer: bool = Field(description="True = sent to customer, False = sent to admin")
    is_active: bool = Field(description="When False the email is silently suppressed")
    subject: str
    body: str
    note: Optional[str] = Field(None, description="Placeholder reference for admin UI")

    model_config = {"from_attributes": True}


class EmailTemplateUpdate(BaseModel):
    """
    Schema for admin updates to an email template.
    Only content fields are mutable — key and trigger_event are immutable.
    """

    subject: Optional[str] = Field(None, max_length=300)
    body: Optional[str] = None
    is_active: Optional[bool] = None
    note: Optional[str] = None
