import smtplib
from email.message import EmailMessage

from loguru import logger

from src.config import settings


def send_contact_emails(
    name: str, email: str, message: str, admin_email: str | None = None
) -> bool:
    """
    Sends two emails:
    1. Notification to the site owner.
    2. Auto-reply to the customer.
    Runs synchronously (should be spawned in BackgroundTasks in FastAPI).
    """
    if not all([settings.SMTP_HOST, settings.SMTP_USER, settings.SMTP_PASSWORD]):
        logger.warning("SMTP configuration is incomplete. Skipping email send.")
        return False

    try:
        # Create SMTP connection
        # Usually port 465 is for SSL, 587 is for TLS
        if settings.SMTP_PORT == 465:
            server = smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT)
        else:
            server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT)
            server.starttls()

        server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        sender = settings.SMTP_USER

        # 1. SEND TO OWNER (ADMIN)
        owner_msg = EmailMessage()
        owner_msg["Subject"] = f"New Inquiry from {name} (The Samen Bondarenko Gallery)"
        owner_msg["From"] = sender
        # Send to the primary admin email or the sender itself
        target_email = admin_email or (
            settings.ADMIN_EMAILS[0] if settings.ADMIN_EMAILS else sender
        )
        owner_msg["To"] = target_email

        # Set reply-to to the customer's email so the owner can reply directly!
        owner_msg["Reply-To"] = email
        owner_msg.set_content(
            f"You have a new message from The Samen Bondarenko Gallery website:\n\n"
            f"Name: {name}\n"
            f"Email: {email}\n\n"
            f"Message:\n{message}"
        )
        server.send_message(owner_msg)

        # 2. SEND AUTO-REPLY TO CUSTOMER
        customer_msg = EmailMessage()
        customer_msg["Subject"] = "Thank you for getting in touch!"
        customer_msg["From"] = sender
        customer_msg["To"] = email
        customer_msg.set_content(
            f"Hello {name},\n\n"
            f"Thank you for contacting The Samen Bondarenko Gallery. This is an automated message to confirm that we have received your inquiry.\n\n"
            f"We have safely received your message:\n"
            f'"{message}"\n\n'
            f"Best regards,\n"
            f"The Samen Bondarenko Gallery"
        )
        server.send_message(customer_msg)

        server.quit()
        logger.info(f"Successfully sent contact emails for {email}")
        return True

    except Exception as e:
        logger.error(f"Failed to send email: {e}")
        return False
