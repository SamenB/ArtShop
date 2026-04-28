"""
API endpoints for managing email templates.
Allows admin to view and update the content of all transactional emails
without modifying application code.
"""

from fastapi import APIRouter, HTTPException

from src.api.dependencies import AdminDep, DBDep
from src.schemas.email_templates import EmailTemplate, EmailTemplateUpdate

router = APIRouter(prefix="/email-templates", tags=["Email Templates"])


@router.get("", response_model=list[EmailTemplate])
async def get_email_templates(admin_id: AdminDep, db: DBDep):
    """
    Returns all email templates. Requires admin privileges.
    """
    rows = await db.email_templates.get_all()
    return rows


@router.put("/{template_id}", response_model=EmailTemplate)
async def update_email_template(
    template_id: int,
    data: EmailTemplateUpdate,
    admin_id: AdminDep,
    db: DBDep,
):
    """
    Updates the mutable fields of an email template (subject, body, is_active, note).
    The key and trigger_event fields are immutable and cannot be changed via this endpoint.
    Requires admin privileges.
    """
    from sqlalchemy import select

    from src.models.email_templates import EmailTemplateOrm

    result = await db.session.execute(
        select(EmailTemplateOrm).where(EmailTemplateOrm.id == template_id)
    )
    row = result.scalars().one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Email template not found")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(row, field, value)

    await db.commit()
    await db.session.refresh(row)
    return EmailTemplate.model_validate(row, from_attributes=True)
