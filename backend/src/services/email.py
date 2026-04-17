"""
Service for handling email communications.
Integrates with SMTP to send transactional emails: contact notifications,
automated customer replies, and order fulfillment status updates.

Email content (subjects and bodies) is loaded from the database EmailTemplateOrm table,
making it fully editable via the admin panel without code deployments.
"""

import smtplib
from email.message import EmailMessage

from loguru import logger

from src.config import settings


def _build_smtp_connection():
    """Establishes and returns an authenticated SMTP connection."""
    if settings.SMTP_PORT == 465:
        server = smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT)
    else:
        server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT)
        server.starttls()
    server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
    return server


def _send_single_email(*, to: str, subject: str, body: str) -> bool:
    """
    Low-level helper to send a single plain-text email via SMTP.

    Returns:
        bool: True if sent successfully, False otherwise.
    """
    if not all([settings.SMTP_HOST, settings.SMTP_USER, settings.SMTP_PASSWORD]):
        logger.warning("SMTP configuration is incomplete. Skipping email send.")
        return False

    try:
        msg = EmailMessage()
        msg["Subject"] = subject
        msg["From"] = settings.SMTP_USER
        msg["To"] = to
        msg["Reply-To"] = settings.SMTP_USER
        msg.set_content(body)

        server = _build_smtp_connection()
        server.send_message(msg)
        server.quit()
        return True
    except Exception as e:
        logger.error("Failed to send email to {}: {}", to, e)
        return False


def send_contact_emails(
    name: str,
    email: str,
    message: str,
    admin_email: str | None = None,
    # Templates are fetched before entering the thread and passed in as plain strings
    admin_subject: str | None = None,
    admin_body_template: str | None = None,
    autoreply_subject: str | None = None,
    autoreply_body_template: str | None = None,
) -> bool:
    """
    Sends contact form notification emails.

    Logic:
    1. Sends an alert to the site administrator with the customer's details and message.
    2. Sends an automated acknowledgment (auto-reply) to the customer.

    Template strings are passed in pre-rendered from the caller's async context
    (already loaded from the DB) so this sync function can run safely in a thread.

    Returns:
        bool: True if both emails were sent successfully, False otherwise.
    """
    target_email = admin_email or (settings.ADMIN_EMAILS[0] if settings.ADMIN_EMAILS else settings.SMTP_USER)
    
    ok1 = True
    ok2 = True

    # ── 1. Admin notification ─────────────────────────────────────────────────
    if admin_subject and admin_body_template:
        admin_subj = admin_subject.format(name=name, email=email, message=message)
        admin_body = admin_body_template.format(name=name, email=email, message=message)
        ok1 = _send_single_email(to=target_email, subject=admin_subj, body=admin_body)

    # ── 2. Customer auto-reply ────────────────────────────────────────────────
    if autoreply_subject and autoreply_body_template:
        reply_subj = autoreply_subject.format(name=name, email=email)
        reply_body = autoreply_body_template.format(name=name, email=email, message=message)
        ok2 = _send_single_email(to=email, subject=reply_subj, body=reply_body)

    if ok1 and ok2:
        logger.info("Successfully processed contact emails for {}", email)
    return ok1 and ok2


def send_fulfillment_status_email(
    order_id: int,
    first_name: str,
    customer_email: str,
    fulfillment_status: str,
    tracking_number: str | None = None,
    carrier: str | None = None,
    tracking_url: str | None = None,
    # Pre-rendered template content from DB (loaded in async context before threading)
    subject_template: str | None = None,
    body_template: str | None = None,
) -> bool:
    """
    Sends a transactional email to the customer when their order's
    fulfillment status changes.

    Template strings are fetched from the DB in the async context and passed in
    so this synchronous SMTP call can run safely in a background thread.

    Args:
        order_id:           The internal order ID.
        first_name:         Customer's first name for personalization.
        customer_email:     Customer's email address.
        fulfillment_status: The new fulfillment status string.
        tracking_number:    Optional carrier tracking number (for 'shipped').
        carrier:            Optional carrier name (for 'shipped').
        tracking_url:       Optional direct tracking page URL (for 'shipped').
        subject_template:   Subject string with {order_id} placeholder.
        body_template:      Body string with {first_name}, {order_id}, {tracking_block} placeholders.

    Returns:
        bool: True if sent successfully, False otherwise.
    """
    if not subject_template or not body_template:
        logger.warning(
            "No email template provided for fulfillment_status '{}', skipping.", fulfillment_status
        )
        return True  # Not an error — template may be intentionally inactive

    try:
        # Build tracking block for 'shipped' emails
        tracking_block = ""
        if fulfillment_status == "shipped":
            if tracking_number:
                carrier_label = carrier or "Carrier"
                tracking_block = f"Carrier: {carrier_label}\nTracking number: {tracking_number}\n"
                if tracking_url:
                    tracking_block += f"Track your parcel: {tracking_url}\n"
            tracking_block += "\n"

        subject = subject_template.format(order_id=order_id, first_name=first_name)
        body = body_template.format(
            first_name=first_name,
            order_id=order_id,
            tracking_block=tracking_block,
        )

        ok = _send_single_email(to=customer_email, subject=subject, body=body)
        if ok:
            logger.info(
                "Fulfillment email sent: order={} status={} to={}",
                order_id,
                fulfillment_status,
                customer_email,
            )
        return ok

    except Exception as e:
        logger.error("Failed to send fulfillment email for order {}: {}", order_id, e)
        return False
