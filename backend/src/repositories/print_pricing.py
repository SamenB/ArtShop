"""
Repository for print pricing and aspect ratio data access.
"""

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from src.models.print_pricing import PrintAspectRatioOrm, PrintPricingOrm
from src.repositories.base import BaseRepository
from src.repositories.mappers.mappers import AspectRatioMapper, PrintPricingMapper
from src.schemas.print_pricing import AspectRatioItem, PrintPricingItem


class PrintAspectRatioRepository(BaseRepository):
    """
    Provides data access for PrintAspectRatioOrm records.
    """

    model = PrintAspectRatioOrm
    mapper = AspectRatioMapper

    async def get_all_ordered(self) -> list:
        """Returns all aspect ratios sorted by sort_order, then label, with pricing rows."""
        result = await self.session.execute(
            select(self.model)
            .options(selectinload(self.model.pricing_rows))
            .order_by(self.model.sort_order, self.model.label)
        )
        return list(result.scalars().unique().all())

    async def get_with_pricing(self, aspect_ratio_id: int) -> PrintAspectRatioOrm | None:
        """
        Fetches a single aspect ratio with eagerly-loaded pricing rows.
        Used by the admin pricing tab to render the full nested grid.
        """
        result = await self.session.execute(
            select(self.model)
            .options(selectinload(self.model.pricing_rows))
            .where(self.model.id == aspect_ratio_id)
        )
        return result.scalars().one_or_none()


class PrintPricingRepository(BaseRepository):
    """
    Provides data access for PrintPricingOrm records.
    """

    model = PrintPricingOrm
    mapper = PrintPricingMapper

    async def get_by_aspect_ratio(self, aspect_ratio_id: int) -> list[PrintPricingOrm]:
        """Returns all pricing rows for a specific aspect ratio, sorted by type then price."""
        result = await self.session.execute(
            select(self.model)
            .where(self.model.aspect_ratio_id == aspect_ratio_id)
            .order_by(self.model.print_type, self.model.price)
        )
        return list(result.scalars().all())

    async def get_by_type(self, print_type: str) -> list[PrintPricingOrm]:
        """
        Retrieves all pricing entries for a specific print type,
        ordered by price ascending.
        """
        result = await self.session.execute(
            select(self.model)
            .where(self.model.print_type == print_type)
            .order_by(self.model.price)
        )
        return list(result.scalars().all())
