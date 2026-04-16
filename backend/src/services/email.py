"""
Service for handling email communications.
Integrates with SMTP to send transactional emails: contact notifications,
automated customer replies, and order fulfillment status updates.
"""

import smtplib
from email.message import EmailMessage

from loguru import logger

from src.config import settings

# ── Human-friendly labels for fulfillment statuses ──────────────────────────

FULFILLMENT_EMAIL_SUBJECT: dict[str, str] = {
    "confirmed": "Your order has been confirmed — Order #{}",
    "print_ordered": "Your artwork is being printed — Order #{}",
    "print_received": "Your artwork print is ready — Order #{}",
    "packaging": "Your order is being packaged — Order #{}",
    "shipped": "🎨 Your artwork is on its way! — Order #{}",
    "delivered": "We hope you love it! — Order #{}",
    "cancelled": "Your order has been cancelled — Order #{}",
}

FULFILLMENT_EMAIL_BODY: dict[str, str] = {
    "confirmed": (
        "Hello {first_name},\n\n"
        "Great news — your order #{order_id} has been confirmed and we are "
        "now beginning to prepare your artwork.\n\n"
        "We will keep you updated at every step of the journey.\n\n"
        "Thank you for supporting independent art!\n"
    ),
    "print_ordered": (
        "Hello {first_name},\n\n"
        "Your order #{order_id} is at the printers!\n\n"
        "We've sent your artwork to our professional print studio. "
        "Once it's back in our hands, we'll pack it carefully and ship it to you.\n\n"
        "Thank you for your patience!\n"
    ),
    "print_received": (
        "Hello {first_name},\n\n"
        "Your print for order #{order_id} has arrived from the studio "
        "and it looks absolutely beautiful.\n\n"
        "We're now preparing to carefully package it for shipping.\n"
    ),
    "packaging": (
        "Hello {first_name},\n\n"
        "Your order #{order_id} is being packaged right now.\n\n"
        "We take great care to protect every piece for its journey to you. "
        "You'll receive a tracking number as soon as it's dispatched.\n"
    ),
    "shipped": (
        "Hello {first_name},\n\n"
        "Your artwork is on its way! 🚀\n\n"
        "Order: #{order_id}\n"
        "{tracking_block}"
        "\nPlease allow a few days for delivery depending on your location.\n\n"
        "We hope you'll love it as much as we loved creating it.\n"
    ),
    "delivered": (
        "Hello {first_name},\n\n"
        "We hope you've received and are enjoying your order #{order_id}!\n\n"
        "If you have a moment, we'd love to hear your thoughts. "
        "Feel free to reply to this email or reach out on our website.\n\n"
        "Thank you for being a collector of original art.\n"
    ),
    "cancelled": (
        "Hello {first_name},\n\n"
        "Your order #{order_id} has been cancelled.\n\n"
        "If you have any questions or believe this was done in error, "
        "please reply to this email and we'll sort it out immediately.\n"
    ),
}


def _build_smtp_connection():
    """Establishes and returns an authenticated SMTP connection."""
    if settings.SMTP_PORT == 465:
        server = smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT)
    else:
        server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT)
        server.starttls()
    server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
    return server


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
        server = _build_smtp_connection()
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


def send_fulfillment_status_email(
    order_id: int,
    first_name: str,
    customer_email: str,
    fulfillment_status: str,
    tracking_number: str | None = None,
    carrier: str | None = None,
    tracking_url: str | None = None,
) -> bool:
    """
    Sends a transactional email to the customer when their order's
    fulfillment status changes.

    Not all status transitions trigger an email — only meaningful
    customer-facing milestones are communicated:
        confirmed, print_ordered, packaging, shipped, delivered, cancelled.

    The 'print_received' status is an internal workflow step and does not
    send a customer notification.

    Args:
        order_id: The internal order ID.
        first_name: Customer's first name for personalization.
        customer_email: Customer's email address.
        fulfillment_status: The new fulfillment status string.
        tracking_number: Optional carrier tracking number (for 'shipped').
        carrier: Optional carrier name (for 'shipped').
        tracking_url: Optional direct tracking page URL (for 'shipped').

    Returns:
        bool: True if sent successfully, False otherwise.
    """
    # 'print_received' is an internal step — no customer notification needed.
    SILENT_STATUSES = {"print_received", "packaging"}
    if fulfillment_status in SILENT_STATUSES:
        logger.debug(
            "Suppressing customer email for internal status '{}' on order {}",
            fulfillment_status,
            order_id,
        )
        return True

    subject_template = FULFILLMENT_EMAIL_SUBJECT.get(fulfillment_status)
    body_template = FULFILLMENT_EMAIL_BODY.get(fulfillment_status)

    if not subject_template or not body_template:
        logger.warning(
            "No email template for fulfillment_status '{}', skipping.", fulfillment_status
        )
        return True

    if not all([settings.SMTP_HOST, settings.SMTP_USER, settings.SMTP_PASSWORD]):
        logger.warning("SMTP not configured. Skipping fulfillment email for order {}.", order_id)
        return False

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

        subject = subject_template.format(order_id)
        body = body_template.format(
            first_name=first_name,
            order_id=order_id,
            tracking_block=tracking_block,
        )

        # Append standard footer
        footer = "\n\nWith gratitude,\nSamen Bondarenko\nsamen-bondarenko.com\n"
        full_body = body + footer

        # Build and send message
        msg = EmailMessage()
        msg["Subject"] = subject
        msg["From"] = settings.SMTP_USER
        msg["To"] = customer_email
        msg["Reply-To"] = settings.SMTP_USER
        msg.set_content(full_body)

        server = _build_smtp_connection()
        server.send_message(msg)
        server.quit()

        logger.info(
            "Fulfillment email sent: order={} status={} to={}",
            order_id,
            fulfillment_status,
            customer_email,
        )
        return True

    except Exception as e:
        logger.error("Failed to send fulfillment email for order {}: {}", order_id, e)
        return False
