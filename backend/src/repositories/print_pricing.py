"""
Repository for normalized print aspect ratios and legacy manual pricing rows.
"""

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from src.models.print_pricing import PrintAspectRatioOrm, PrintPricingOrm
from src.repositories.base import BaseRepository
from src.repositories.mappers.mappers import AspectRatioMapper, PrintPricingMapper


class PrintAspectRatioRepository(BaseRepository):
    """
    Provides data access for normalized print aspect ratio records.
    """

    model = PrintAspectRatioOrm
    mapper = AspectRatioMapper

    async def get_all_ordered(self) -> list:
        """Returns all aspect ratios sorted by sort_order, then label."""
        result = await self.session.execute(
            select(self.model)
            .options(selectinload(self.model.pricing_rows))
            .order_by(self.model.sort_order, self.model.label)
        )
        return list(result.scalars().unique().all())


class PrintPricingRepository(BaseRepository):
    """
    Provides data access for legacy manual pricing rows.
    """

    model = PrintPricingOrm
    mapper = PrintPricingMapper

    async def get_by_aspect_ratio(self, aspect_ratio_id: int) -> list[PrintPricingOrm]:
        """Returns all legacy pricing rows for a specific aspect ratio."""
        result = await self.session.execute(
            select(self.model)
            .where(self.model.aspect_ratio_id == aspect_ratio_id)
            .order_by(self.model.print_type, self.model.price)
        )
        return list(result.scalars().all())

    async def get_by_type(self, print_type: str) -> list[PrintPricingOrm]:
        """
        Retrieves all legacy pricing entries for a specific print type,
        ordered by price ascending.
        """
        result = await self.session.execute(
            select(self.model)
            .where(self.model.print_type == print_type)
            .order_by(self.model.price)
        )
        return list(result.scalars().all())
