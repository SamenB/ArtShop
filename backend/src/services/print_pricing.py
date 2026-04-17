"""
Service layer for print pricing and aspect ratio management.
Handles CRUD operations for both aspect ratio categories and their pricing rows.
"""

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from src.exeptions import DatabaseException, ObjectNotFoundException
from src.models.print_pricing import PrintAspectRatioOrm, PrintPricingOrm
from src.schemas.print_pricing import (
    AspectRatioCreate,
    AspectRatioItem,
    AspectRatioUpdate,
    AspectRatioWithPricing,
    PrintPricingCreate,
    PrintPricingItem,
    PrintPricingUpdate,
)
from src.services.base import BaseService


class PrintPricingService(BaseService):
    """
    Provides high-level methods for managing print aspect ratios and pricing entries.
    """

    # ── Aspect Ratio CRUD ─────────────────────────────────────────────────────

    async def get_all_aspect_ratios(self) -> list[AspectRatioItem]:
        """Returns all aspect ratio categories sorted by sort_order, then label."""
        try:
            rows = await self.db.aspect_ratios.get_all_ordered()
            return [AspectRatioItem.model_validate(r, from_attributes=True) for r in rows]
        except SQLAlchemyError:
            raise DatabaseException

    async def get_aspect_ratio_with_pricing(self, aspect_ratio_id: int) -> AspectRatioWithPricing:
        """Returns a single aspect ratio with all nested pricing rows."""
        try:
            row = await self.db.aspect_ratios.get_with_pricing(aspect_ratio_id)
            if not row:
                raise ObjectNotFoundException
            return AspectRatioWithPricing.model_validate(row, from_attributes=True)
        except ObjectNotFoundException:
            raise
        except SQLAlchemyError:
            raise DatabaseException

    async def get_all_with_pricing(self) -> list[AspectRatioWithPricing]:
        """Returns all aspect ratios with their nested pricing rows. Used by admin tab."""
        try:
            rows = await self.db.aspect_ratios.get_all_ordered()
            return [AspectRatioWithPricing.model_validate(r, from_attributes=True) for r in rows]
        except SQLAlchemyError:
            raise DatabaseException

    async def create_aspect_ratio(self, data: AspectRatioCreate) -> AspectRatioItem:
        """Creates a new aspect ratio category."""
        try:
            row = PrintAspectRatioOrm(
                label=data.label,
                description=data.description,
                sort_order=data.sort_order,
            )
            self.db.session.add(row)
            await self.db.commit()
            await self.db.session.refresh(row)
            return AspectRatioItem.model_validate(row, from_attributes=True)
        except SQLAlchemyError:
            await self.db.rollback()
            raise DatabaseException

    async def update_aspect_ratio(self, aspect_ratio_id: int, data: AspectRatioUpdate) -> AspectRatioItem:
        """Applies a partial update to an aspect ratio category."""
        try:
            result = await self.db.session.execute(
                select(PrintAspectRatioOrm).where(PrintAspectRatioOrm.id == aspect_ratio_id)
            )
            row = result.scalars().one_or_none()
            if not row:
                raise ObjectNotFoundException

            if data.label is not None:
                row.label = data.label
            if data.description is not None:
                row.description = data.description
            if data.sort_order is not None:
                row.sort_order = data.sort_order

            await self.db.commit()
            await self.db.session.refresh(row)
            return AspectRatioItem.model_validate(row, from_attributes=True)
        except ObjectNotFoundException:
            raise
        except SQLAlchemyError:
            await self.db.rollback()
            raise DatabaseException

    async def delete_aspect_ratio(self, aspect_ratio_id: int) -> None:
        """
        Deletes an aspect ratio and all its pricing rows (via CASCADE).
        Also nullifies print_aspect_ratio_id on any artworks referencing this ratio
        (handled at DB level via ON DELETE SET NULL).
        """
        try:
            result = await self.db.session.execute(
                select(PrintAspectRatioOrm).where(PrintAspectRatioOrm.id == aspect_ratio_id)
            )
            row = result.scalars().one_or_none()
            if not row:
                raise ObjectNotFoundException
            await self.db.session.delete(row)
            await self.db.commit()
        except ObjectNotFoundException:
            raise
        except SQLAlchemyError:
            await self.db.rollback()
            raise DatabaseException

    # ── Pricing Row CRUD ─────────────────────────────────────────────────────

    async def get_all(self) -> list[PrintPricingItem]:
        """Returns all pricing entries ordered by aspect_ratio_id, print_type, price."""
        try:
            rows = await self.db.print_pricing.get_all()
            return rows
        except SQLAlchemyError:
            raise DatabaseException

    async def create(self, data: PrintPricingCreate) -> PrintPricingItem:
        """Creates a new pricing entry under the specified aspect ratio."""
        try:
            # Ensure parent exists
            parent = await self.db.session.get(PrintAspectRatioOrm, data.aspect_ratio_id)
            if not parent:
                raise ObjectNotFoundException(detail="Aspect ratio not found")

            row = PrintPricingOrm(
                aspect_ratio_id=data.aspect_ratio_id,
                print_type=data.print_type.value,
                size_label=data.size_label,
                price=data.price,
            )
            self.db.session.add(row)
            await self.db.commit()
            await self.db.session.refresh(row)
            return PrintPricingItem.model_validate(row, from_attributes=True)
        except ObjectNotFoundException:
            raise
        except SQLAlchemyError:
            await self.db.rollback()
            raise DatabaseException

    async def update(self, item_id: int, data: PrintPricingUpdate) -> PrintPricingItem:
        """Applies a partial update to an existing pricing entry."""
        try:
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
            result = await self.db.session.execute(
                select(PrintPricingOrm).where(PrintPricingOrm.id == item_id)
            )
            row = result.scalars().one_or_none()
            if not row:
                raise ObjectNotFoundException
            await self.db.session.delete(row)
            await self.db.commit()
        except ObjectNotFoundException:
            raise
        except SQLAlchemyError:
            await self.db.rollback()
            raise DatabaseException
