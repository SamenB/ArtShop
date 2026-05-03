"""
Migration: Add print type flags, email templates, print pricing.

Changes:
1. artworks table:
   - ADD: has_original, has_canvas_print, has_canvas_print_limited,
           has_paper_print, has_paper_print_limited
   - Data migration: set has_original=True where original_status='available',
                     set has_canvas_print=True where has_prints=True
   - DROP: has_prints, base_print_price

2. order_items table:
   - ALTER edition_type column to VARCHAR(30) to accommodate new type names

3. CREATE TABLE print_pricing

4. CREATE TABLE email_templates + seed all 10 templates

5. site_settings table:
   - DROP: global_print_price
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

revision = "2026_04_17_print_types"
down_revision = "c6fea1af7f24"
branch_labels = None
depends_on = None


# ── Seed data for email_templates ─────────────────────────────────────────────

EMAIL_TEMPLATES_SEED = [
    {
        "key": "fulfillment_confirmed",
        "trigger_event": "fulfillment.confirmed",
        "send_to_customer": True,
        "is_active": True,
        "subject": "Your order has been confirmed — Order #{order_id}",
        "body": (
            "Hello {first_name},\n\n"
            "Great news — your order #{order_id} has been confirmed and we are "
            "now beginning to prepare your artwork.\n\n"
            "We will keep you updated at every step of the journey.\n\n"
            "Thank you for supporting independent art!"
        ),
        "note": "Placeholders: {first_name}, {order_id}. Sent automatically after payment is confirmed.",
    },
    {
        "key": "fulfillment_print_ordered",
        "trigger_event": "fulfillment.print_ordered",
        "send_to_customer": True,
        "is_active": True,
        "subject": "Your artwork is being printed — Order #{order_id}",
        "body": (
            "Hello {first_name},\n\n"
            "Your order #{order_id} is at the printers!\n\n"
            "We've sent your artwork to our professional print studio. "
            "Once it's back in our hands, we'll pack it carefully and ship it to you.\n\n"
            "Thank you for your patience!"
        ),
        "note": "Placeholders: {first_name}, {order_id}. Sent when admin moves order to 'print_ordered'.",
    },
    {
        "key": "fulfillment_print_received",
        "trigger_event": "fulfillment.print_received",
        "send_to_customer": False,
        "is_active": False,
        "subject": "Print received for Order #{order_id} (internal)",
        "body": (
            "Hello {first_name},\n\n"
            "Your print for order #{order_id} has arrived from the studio "
            "and it looks absolutely beautiful.\n\n"
            "We're now preparing to carefully package it for shipping."
        ),
        "note": "Internal status — email is suppressed by default (is_active=False). "
                "Placeholders: {first_name}, {order_id}.",
    },
    {
        "key": "fulfillment_packaging",
        "trigger_event": "fulfillment.packaging",
        "send_to_customer": False,
        "is_active": False,
        "subject": "Order #{order_id} is being packaged (internal)",
        "body": (
            "Hello {first_name},\n\n"
            "Your order #{order_id} is being packaged right now.\n\n"
            "We take great care to protect every piece for its journey to you. "
            "You'll receive a tracking number as soon as it's dispatched."
        ),
        "note": "Internal status — email is suppressed by default (is_active=False). "
                "Placeholders: {first_name}, {order_id}.",
    },
    {
        "key": "fulfillment_shipped",
        "trigger_event": "fulfillment.shipped",
        "send_to_customer": True,
        "is_active": True,
        "subject": "🎨 Your artwork is on its way! — Order #{order_id}",
        "body": (
            "Hello {first_name},\n\n"
            "Your artwork is on its way! 🚀\n\n"
            "Order: #{order_id}\n"
            "{tracking_block}"
            "\nPlease allow a few days for delivery depending on your location.\n\n"
            "We hope you'll love it as much as we loved creating it."
        ),
        "note": (
            "Placeholders: {first_name}, {order_id}, {tracking_block}.\n"
            "{tracking_block} is auto-populated with carrier name, tracking number, and tracking URL "
            "when these are provided in the fulfillment update."
        ),
    },
    {
        "key": "fulfillment_delivered",
        "trigger_event": "fulfillment.delivered",
        "send_to_customer": True,
        "is_active": True,
        "subject": "We hope you love it! — Order #{order_id}",
        "body": (
            "Hello {first_name},\n\n"
            "We hope you've received and are enjoying your order #{order_id}!\n\n"
            "If you have a moment, we'd love to hear your thoughts. "
            "Feel free to reply to this email or reach out on our website.\n\n"
            "Thank you for being a collector of original art."
        ),
        "note": "Placeholders: {first_name}, {order_id}. Sent when admin marks order as 'delivered'.",
    },
    {
        "key": "fulfillment_cancelled",
        "trigger_event": "fulfillment.cancelled",
        "send_to_customer": True,
        "is_active": True,
        "subject": "Your order has been cancelled — Order #{order_id}",
        "body": (
            "Hello {first_name},\n\n"
            "Your order #{order_id} has been cancelled.\n\n"
            "If you have any questions or believe this was done in error, "
            "please reply to this email and we'll sort it out immediately."
        ),
        "note": "Placeholders: {first_name}, {order_id}. Sent on manual or automatic cancellation.",
    },
    {
        "key": "contact_admin",
        "trigger_event": "contact.submitted",
        "send_to_customer": False,
        "is_active": True,
        "subject": "New Inquiry from {name} (The Samen Bondarenko Gallery)",
        "body": (
            "You have a new message from The Samen Bondarenko Gallery website:\n\n"
            "Name: {name}\n"
            "Email: {email}\n\n"
            "Message:\n{message}"
        ),
        "note": "Sent to the gallery owner when the contact form is submitted. "
                "Placeholders: {name}, {email}, {message}.",
    },
    {
        "key": "contact_autoreply",
        "trigger_event": "contact.submitted",
        "send_to_customer": True,
        "is_active": True,
        "subject": "Thank you for getting in touch!",
        "body": (
            "Hello {name},\n\n"
            "Thank you for contacting The Samen Bondarenko Gallery. "
            "This is an automated message to confirm that we have received your inquiry.\n\n"
            'Message received:\n"{message}"\n\n'
            "Best regards,\nThe Samen Bondarenko Gallery"
        ),
        "note": "Auto-reply sent to the customer after contact form submission. "
                "Placeholders: {name}, {email}, {message}.",
    },
]


def upgrade() -> None:
    conn = op.get_bind()

    # ── 1. artworks: add new print flags ──────────────────────────────────────
    op.add_column("artworks", sa.Column("has_original", sa.Boolean(), nullable=False,
                                        server_default=sa.text("false")))
    op.add_column("artworks", sa.Column("has_canvas_print", sa.Boolean(), nullable=False,
                                        server_default=sa.text("false")))
    op.add_column("artworks", sa.Column("has_canvas_print_limited", sa.Boolean(), nullable=False,
                                        server_default=sa.text("false")))
    op.add_column("artworks", sa.Column("has_paper_print", sa.Boolean(), nullable=False,
                                        server_default=sa.text("false")))
    op.add_column("artworks", sa.Column("has_paper_print_limited", sa.Boolean(), nullable=False,
                                        server_default=sa.text("false")))

    # ── 2. Data migration: carry forward existing state ───────────────────────
    # Artworks with an available original → mark has_original = True
    conn.execute(text(
        "UPDATE artworks SET has_original = true WHERE original_status = 'available'"
    ))
    # Artworks that had prints enabled → default to canvas_print (most common)
    conn.execute(text(
        "UPDATE artworks SET has_canvas_print = true WHERE has_prints = true"
    ))

    # ── 3. artworks: drop legacy columns ─────────────────────────────────────
    op.drop_column("artworks", "has_prints")
    op.drop_column("artworks", "base_print_price")

    # ── 4. order_items: widen edition_type to VARCHAR(30) ────────────────────
    op.alter_column(
        "order_items",
        "edition_type",
        existing_type=sa.String(length=20),
        type_=sa.String(length=30),
        existing_nullable=False,
    )

    # ── 5. Create print_pricing table ─────────────────────────────────────────
    op.create_table(
        "print_pricing",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("print_type", sa.String(length=30), nullable=False),
        sa.Column("size_label", sa.String(length=50), nullable=False),
        sa.Column("price", sa.Integer(), nullable=False),
    )
    op.create_index("ix_print_pricing_print_type", "print_pricing", ["print_type"])

    # ── 6. Create email_templates table ───────────────────────────────────────
    op.create_table(
        "email_templates",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("key", sa.String(length=100), nullable=False),
        sa.Column("trigger_event", sa.String(length=100), nullable=False),
        sa.Column("send_to_customer", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("subject", sa.String(length=300), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
    )
    op.create_index("ix_email_templates_key", "email_templates", ["key"], unique=True)

    # ── 7. Seed email templates from current hardcoded values ─────────────────
    email_templates_table = sa.table(
        "email_templates",
        sa.column("key", sa.String),
        sa.column("trigger_event", sa.String),
        sa.column("send_to_customer", sa.Boolean),
        sa.column("is_active", sa.Boolean),
        sa.column("subject", sa.String),
        sa.column("body", sa.Text),
        sa.column("note", sa.Text),
    )
    op.bulk_insert(email_templates_table, EMAIL_TEMPLATES_SEED)

    # ── 8. site_settings: drop global_print_price ────────────────────────────
    op.drop_column("site_settings", "global_print_price")


def downgrade() -> None:
    conn = op.get_bind()

    # Restore global_print_price to site_settings
    op.add_column("site_settings", sa.Column("global_print_price", sa.Integer(),
                                              nullable=False, server_default="150"))

    # Drop email_templates
    op.drop_index("ix_email_templates_key", table_name="email_templates")
    op.drop_table("email_templates")

    # Drop print_pricing
    op.drop_index("ix_print_pricing_print_type", table_name="print_pricing")
    op.drop_table("print_pricing")

    # Restore order_items.edition_type to VARCHAR(20)
    op.alter_column(
        "order_items",
        "edition_type",
        existing_type=sa.String(length=30),
        type_=sa.String(length=20),
        existing_nullable=False,
    )

    # Restore artworks legacy columns
    op.add_column("artworks", sa.Column("base_print_price", sa.Integer(), nullable=True))
    op.add_column("artworks", sa.Column("has_prints", sa.Boolean(), nullable=False,
                                        server_default=sa.text("false")))

    # Restore data: has_prints from has_canvas_print
    conn.execute(text(
        "UPDATE artworks SET has_prints = true WHERE has_canvas_print = true"
    ))

    # Drop new flag columns
    for col in ["has_original", "has_canvas_print", "has_canvas_print_limited",
                "has_paper_print", "has_paper_print_limited"]:
        op.drop_column("artworks", col)
