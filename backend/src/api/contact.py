from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, EmailStr
from src.services.email import send_contact_emails
from src.api.dependencies import DBDep
from src.models.site_settings import SiteSettingsOrm
import asyncio

router = APIRouter(prefix="/contact", tags=["Contact"])

class ContactRequest(BaseModel):
    name: str
    email: EmailStr
    message: str

@router.post("")
async def submit_contact_form(payload: ContactRequest, background_tasks: BackgroundTasks, db: DBDep):
    try:
        settings_obj = await db.session.get(SiteSettingsOrm, 1)
        admin_email = settings_obj.contact_email if settings_obj else None
        
        # Offload email sending to the background so it doesn't block the UI
        background_tasks.add_task(send_contact_emails, payload.name, payload.email, payload.message, admin_email)
        return {"message": "Success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to process contact request.")
