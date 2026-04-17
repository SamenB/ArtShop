"""
Service layer for print pricing management.
Handles CRUD operations for the print pricing grid.
"""

from sqlalchemy.exc import SQLAlchemyError

from src.exeptions import DatabaseException, ObjectNotFoundException
from src.schemas.print_pricing import PrintPricingCreate, PrintPricingItem, PrintPricingUpdate
from src.services.base import BaseService


class PrintPricingService(BaseService):
    """
    Provides high-level methods for managing print pricing entries.
    """

    async def get_all(self) -> list[PrintPricingItem]:
        """Returns all pricing entries ordered by print_type then price."""
        try:
            rows = await self.db.print_pricing.get_all()
            return rows
        except SQLAlchemyError:
            raise DatabaseException

    async def create(self, data: PrintPricingCreate) -> PrintPricingItem:
        """Creates a new pricing entry."""
        try:
            from src.models.print_pricing import PrintPricingOrm

            row = PrintPricingOrm(
                print_type=data.print_type.value,
                size_label=data.size_label,
                price=data.price,
            )
            self.db.session.add(row)
            await self.db.commit()
            await self.db.session.refresh(row)
            return PrintPricingItem.model_validate(row, from_attributes=True)
        except SQLAlchemyError:
            await self.db.rollback()
            raise DatabaseException

    async def update(self, item_id: int, data: PrintPricingUpdate) -> PrintPricingItem:
        """Applies a partial update to an existing pricing entry."""
        try:
            from src.models.print_pricing import PrintPricingOrm
            from sqlalchemy import select

            result = await self.db.session.execute(
                select(PrintPricingOrm).where(PrintPricingOrm.id == item_id)
            )
            row = result.scalars().one_or_none()
            if not row:
                raise ObjectNotFoundException

            if data.size_label is not None:
                row.size_label = data.size_label
            if data.price is not None:
                row.price = data.price

            await self.db.commit()
            await self.db.session.refresh(row)
            return PrintPricingItem.model_validate(row, from_attributes=True)
        except ObjectNotFoundException:
            raise
        except SQLAlchemyError:
            await self.db.rollback()
            raise DatabaseException

    async def delete(self, item_id: int) -> None:
        """Deletes a pricing entry by ID."""
        try:
            from src.models.print_pricing import PrintPricingOrm
            from sqlalchemy import delete

            result = await self.db.session.execute(
                delete(PrintPricingOrm).where(PrintPricingOrm.id == item_id)
            )
            if result.rowcount == 0:
                raise ObjectNotFoundException
            await self.db.commit()
        except ObjectNotFoundException:
            raise
        except SQLAlchemyError:
            await self.db.rollback()
            raise DatabaseException
