"""Repository for normalized print aspect ratios."""

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from src.models.print_pricing import PrintAspectRatioOrm
from src.repositories.base import BaseRepository
from src.repositories.mappers.mappers import AspectRatioMapper


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
