"""
Service for handling email communications.
Integrates with SMTP to send transactional emails like contact notifications 
and automated customer replies.
"""
import smtplib
from email.message import EmailMessage

from loguru import logger

from src.config import settings


def send_contact_emails(
    name: str, email: str, message: str, admin_email: str | None = None
) -> bool:
    """
    Orchestrates the sending of contact form notification emails.
    
    Logic:
    1. Sends an alert to the site administrator with the customer's details and message.
    2. Sends an automated acknowledgment (auto-reply) to the customer.
    
    Note: This function is synchronous and should be executed in a background task 
    to avoid blocking the main API response.
    
    Returns:
        bool: True if both emails were sent successfully, False otherwise.
    """
    if not all([settings.SMTP_HOST, settings.SMTP_USER, settings.SMTP_PASSWORD]):
        logger.warning("SMTP configuration is incomplete. Skipping email send.")
        return False

    try:
        # Establish SMTP connection.
        # Uses SSL for port 465, otherwise attempts STARTTLS on standard ports like 587.
        if settings.SMTP_PORT == 465:
            server = smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT)
        else:
            server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT)
            server.starttls()

        server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        sender = settings.SMTP_USER

        # 1. SEND NOTIFICATION TO THE SITE OWNER (ADMIN)
        owner_msg = EmailMessage()
        owner_msg["Subject"] = f"New Inquiry from {name} (The Samen Bondarenko Gallery)"
        owner_msg["From"] = sender
        
        # Determine recipient: specified admin_email or first configured admin.
        target_email = admin_email or (
            settings.ADMIN_EMAILS[0] if settings.ADMIN_EMAILS else sender
        )
        owner_msg["To"] = target_email

        # Set Reply-To to the customer's email for direct follow-up convenience.
        owner_msg["Reply-To"] = email
        owner_msg.set_content(
            f"You have a new message from The Samen Bondarenko Gallery website:\n\n"
            f"Name: {name}\n"
            f"Email: {email}\n\n"
            f"Message:\n{message}"
        )
        server.send_message(owner_msg)

        # 2. SEND AUTO-REPLY TO THE CUSTOMER
        customer_msg = EmailMessage()
        customer_msg["Subject"] = "Thank you for getting in touch!"
        customer_msg["From"] = sender
        customer_msg["To"] = email
        customer_msg.set_content(
            f"Hello {name},\n\n"
            f"Thank you for contacting The Samen Bondarenko Gallery. This is an automated message to confirm that we have received your inquiry.\n\n"
            f"Message received:\n"
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
