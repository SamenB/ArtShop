"""
API endpoints for contact form submissions.
Handles sending emails to both the user and the administrator.
Templates are loaded from the database, making the content editable via Admin panel.
"""

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, EmailStr

from src.api.dependencies import DBDep
from src.models.site_settings import SiteSettingsOrm
from src.services.email import send_contact_emails

router = APIRouter(prefix="/contact", tags=["Contact"])


class ContactRequest(BaseModel):
    """
    Schema for the contact form submission request.
    """

    name: str
    email: EmailStr
    message: str


@router.post("")
async def submit_contact_form(
    payload: ContactRequest, background_tasks: BackgroundTasks, db: DBDep
):
    """
    Processes a contact form submission.
    Loads email templates from the database and offloads email sending to a background task.
    """
    try:
        settings_obj = await db.session.get(SiteSettingsOrm, 1)
        admin_email = settings_obj.contact_email if settings_obj else None

        # Load templates from DB in the async context before delegating to background thread
        admin_tpl = await db.email_templates.get_by_key("contact_admin")
        autoreply_tpl = await db.email_templates.get_by_key("contact_autoreply")

        admin_subject = admin_tpl.subject if admin_tpl and admin_tpl.is_active else None
        admin_body = admin_tpl.body if admin_tpl and admin_tpl.is_active else None
        autoreply_subject = (
            autoreply_tpl.subject if autoreply_tpl and autoreply_tpl.is_active else None
        )
        autoreply_body = autoreply_tpl.body if autoreply_tpl and autoreply_tpl.is_active else None

        background_tasks.add_task(
            send_contact_emails,
            payload.name,
            payload.email,
            payload.message,
            admin_email,
            admin_subject,
            admin_body,
            autoreply_subject,
            autoreply_body,
        )
        return {"message": "Success"}
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to process contact request.")
