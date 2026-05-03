"""Add print pricing regions tables.

Revision ID: add_pricing_regions
Revises: faq_content_static_hero
Create Date: 2026-04-28 18:00:00
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import ARRAY

revision: str = "add_pricing_regions"
down_revision: Union[str, Sequence[str], None] = "faq_content_static_hero"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

pricing_regions = sa.table(
    "print_pricing_regions",
    sa.column("slug", sa.String),
    sa.column("label", sa.String),
    sa.column("country_codes", ARRAY(sa.String(3))),
    sa.column("default_multiplier", sa.Float),
    sa.column("sort_order", sa.Integer),
    sa.column("is_fallback", sa.Boolean),
)

pricing_region_multipliers = sa.table(
    "print_pricing_region_multipliers",
    sa.column("region_id", sa.Integer),
    sa.column("category_id", sa.String),
    sa.column("multiplier", sa.Float),
)

recommended_multipliers = {
    "premium": {
        "paperPrintRolled": 3.4,
        "paperPrintBoxFramed": 2.45,
        "paperPrintClassicFramed": 2.5,
        "canvasRolled": 3.25,
        "canvasStretched": 2.85,
        "canvasClassicFrame": 2.3,
        "canvasFloatingFrame": 2.2,
    },
    "mid": {
        "paperPrintRolled": 3.0,
        "paperPrintBoxFramed": 2.15,
        "paperPrintClassicFramed": 2.2,
        "canvasRolled": 2.9,
        "canvasStretched": 2.55,
        "canvasClassicFrame": 2.05,
        "canvasFloatingFrame": 1.95,
    },
    "budget": {
        "paperPrintRolled": 2.65,
        "paperPrintBoxFramed": 1.9,
        "paperPrintClassicFramed": 1.95,
        "canvasRolled": 2.55,
        "canvasStretched": 2.3,
        "canvasClassicFrame": 1.8,
        "canvasFloatingFrame": 1.75,
    },
}


def upgrade() -> None:
    op.create_table(
        "print_pricing_regions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("slug", sa.String(40), unique=True, nullable=False),
        sa.Column("label", sa.String(100), nullable=False),
        sa.Column(
            "country_codes",
            ARRAY(sa.String(3)),
            nullable=False,
            server_default="{}",
        ),
        sa.Column("default_multiplier", sa.Float(), nullable=False, server_default="3.0"),
        sa.Column("sort_order", sa.Integer(), server_default="0"),
        sa.Column("is_fallback", sa.Boolean(), server_default="false"),
    )

    op.create_table(
        "print_pricing_region_multipliers",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "region_id",
            sa.Integer(),
            sa.ForeignKey("print_pricing_regions.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("category_id", sa.String(60), nullable=False),
        sa.Column("multiplier", sa.Float(), nullable=False),
        sa.UniqueConstraint("region_id", "category_id", name="uq_region_category_multiplier"),
    )

    op.bulk_insert(
        pricing_regions,
        [
            {
                "slug": "premium",
                "label": "Premium",
                "country_codes": [
                    "US", "CA", "GB", "IE", "AU", "NZ",
                    "DE", "AT", "CH", "LI", "SE", "NO", "DK", "FI", "IS",
                    "FR", "NL", "BE", "LU", "IT", "ES", "PT", "MC", "SM", "AD",
                    "JP", "SG", "KR", "HK", "TW", "AE", "IL", "SA", "KW", "QA",
                    "BH", "OM", "BN",
                ],
                "default_multiplier": 3.0,
                "sort_order": 1,
                "is_fallback": False,
            },
            {
                "slug": "mid",
                "label": "Mid",
                "country_codes": [
                    "UA",
                    "PL", "CZ", "HU", "RO", "SK", "SI", "HR", "EE", "LV", "LT",
                    "BG", "GR", "CY", "MT", "BA", "ME", "MK", "AL", "RS", "XK",
                    "TR", "MX", "PR", "ZA", "BR", "AR", "CL", "CO", "UY",
                    "MY", "CN", "TH", "ID", "PH", "IN", "VN", "KZ", "GE", "AM",
                    "AZ", "MD",
                ],
                "default_multiplier": 2.7,
                "sort_order": 2,
                "is_fallback": False,
            },
            {
                "slug": "budget",
                "label": "Budget / Fallback",
                "country_codes": [],
                "default_multiplier": 2.4,
                "sort_order": 3,
                "is_fallback": True,
            },
        ],
    )

    connection = op.get_bind()
    region_rows = connection.execute(
        sa.text("SELECT id, slug FROM print_pricing_regions")
    ).mappings()
    region_ids = {row["slug"]: row["id"] for row in region_rows}
    multiplier_rows = [
        {
            "region_id": region_ids[region_slug],
            "category_id": category_id,
            "multiplier": multiplier,
        }
        for region_slug, category_multipliers in recommended_multipliers.items()
        for category_id, multiplier in category_multipliers.items()
        if region_slug in region_ids
    ]
    op.bulk_insert(pricing_region_multipliers, multiplier_rows)


def downgrade() -> None:
    op.drop_table("print_pricing_region_multipliers")
    op.drop_table("print_pricing_regions")
