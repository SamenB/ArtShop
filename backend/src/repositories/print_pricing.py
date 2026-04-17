"""
Repository for print pricing data access.
"""

from sqlalchemy import select

from src.models.print_pricing import PrintPricingOrm
from src.repositories.base import BaseRepository
from src.schemas.print_pricing import PrintPricingItem


class PrintPricingRepository(BaseRepository):
    """
    Provides data access for PrintPricingOrm records.
    """

    model = PrintPricingOrm
    schema = PrintPricingItem

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
