"""
Service layer for normalized print aspect ratios and legacy manual pricing rows.

Aspect ratios remain part of the active admin and artwork workflow.
Manual pricing rows remain only for compatibility and should not be treated as
the runtime storefront price source.
"""

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from src.exeptions import DatabaseException, ObjectNotFoundException
from src.models.print_pricing import PrintAspectRatioOrm, PrintPricingOrm
from src.schemas.print_pricing import (
    AspectRatioCreate,
    AspectRatioItem,
    AspectRatioUpdate,
    PrintPricingCreate,
    PrintPricingItem,
    PrintPricingUpdate,
)
from src.services.base import BaseService

DEFAULT_ASPECT_RATIO_PRESETS = (
    {
        "label": "4:5",
        "description": "Primary gallery ratio for most flagship works.",
        "sort_order": 0,
    },
    {
        "label": "1:1",
        "description": "Square format for central, balanced compositions.",
        "sort_order": 1,
    },
    {
        "label": "2:3",
        "description": "Classic fine art print ratio with broad frame availability.",
        "sort_order": 2,
    },
    {
        "label": "3:4",
        "description": "Collector portrait ratio for taller compositions.",
        "sort_order": 3,
    },
    {
        "label": "5:7",
        "description": "Editorial portrait ratio for selective catalog expansion.",
        "sort_order": 4,
    },
)


class PrintPricingService(BaseService):
    """
    Provides high-level methods for managing normalized print aspect ratios and
    legacy manual pricing entries.
    """

    async def get_all_aspect_ratios(self) -> list[AspectRatioItem]:
        """Returns all aspect ratio categories sorted by sort_order, then label."""
        try:
            await self._ensure_default_aspect_ratios()
            rows = await self.db.aspect_ratios.get_all_ordered()
            return [AspectRatioItem.model_validate(row, from_attributes=True) for row in rows]
        except SQLAlchemyError:
            raise DatabaseException from None

    async def _ensure_default_aspect_ratios(self) -> None:
        existing_rows = await self.db.aspect_ratios.get_all_ordered()
        existing_labels = {row.label for row in existing_rows}
        missing_presets = [
            preset for preset in DEFAULT_ASPECT_RATIO_PRESETS if preset["label"] not in existing_labels
        ]
        if not missing_presets:
            return

        try:
            for preset in missing_presets:
                self.db.session.add(
                    PrintAspectRatioOrm(
                        label=preset["label"],
                        description=preset["description"],
                        sort_order=preset["sort_order"],
                    )
                )
            await self.db.session.commit()
        except SQLAlchemyError:
            await self.db.session.rollback()
            raise

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
            raise DatabaseException from None

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
            raise DatabaseException from None

    async def delete_aspect_ratio(self, aspect_ratio_id: int) -> None:
        """
        Deletes an aspect ratio and all its legacy pricing rows via cascade.
        Any artworks referencing this ratio are nullified by the foreign key.
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
            raise DatabaseException from None

    async def get_all(self) -> list[PrintPricingItem]:
        """Returns all legacy manual pricing entries ordered by ratio, type, and price."""
        try:
            return await self.db.print_pricing.get_all()
        except SQLAlchemyError:
            raise DatabaseException from None

    async def create(self, data: PrintPricingCreate) -> PrintPricingItem:
        """Creates a new legacy manual pricing entry under the specified aspect ratio."""
        try:
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
            raise DatabaseException from None

    async def update(self, item_id: int, data: PrintPricingUpdate) -> PrintPricingItem:
        """Applies a partial update to an existing legacy pricing entry."""
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
            raise DatabaseException from None

    async def delete(self, item_id: int) -> None:
        """Deletes a legacy pricing entry by ID."""
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
            raise DatabaseException from None
