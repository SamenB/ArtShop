"""
Repository for managing artwork data access.
Extends BaseRepository to provide specialized filtering and eager loading of tags.
"""

from sqlalchemy import and_, select
from sqlalchemy.orm import joinedload

from src.exeptions import ObjectNotFoundException
from src.models.artworks import ArtworksOrm
from src.models.labels import LabelsOrm
from src.repositories.base import BaseRepository
from src.repositories.mappers.mappers import ArtworkMapper
from src.repositories.utils import available_artwork_ids
from src.schemas.artworks import ArtworkWithLabels


class ArtworksRepository(BaseRepository):
    """
    Handles complex queries for artworks, including multi-criteria filtering and pagination.
    Uses ArtworkMapper for data transformation.
    """

    model = ArtworksOrm
    mapper = ArtworkMapper

    def _base_query(self):
        return select(self.model).options(
            joinedload(self.model.labels),
            joinedload(self.model.print_aspect_ratio),
        )

    def _apply_common_filters(
        self,
        query,
        *,
        title: str | None = None,
        labels: list[int] | None = None,
        year_from: int | None = None,
        year_to: int | None = None,
        price_min: int | None = None,
        price_max: int | None = None,
        orientation: str | None = None,
        size_category: str | None = None,
    ):
        if title:
            query = query.filter(self.model.title.ilike(f"%{title}%"))

        if labels:
            query = query.filter(self.model.labels.any(LabelsOrm.id.in_(labels)))

        if year_from is not None:
            query = query.filter(self.model.year >= year_from)

        if year_to is not None:
            query = query.filter(self.model.year <= year_to)

        if price_min is not None:
            query = query.filter(self.model.original_price >= price_min)

        if price_max is not None:
            query = query.filter(self.model.original_price <= price_max)

        if orientation == "horizontal":
            query = query.filter(
                and_(
                    self.model.width_cm.isnot(None),
                    self.model.height_cm.isnot(None),
                    self.model.width_cm > self.model.height_cm * 1.1,
                )
            )
        elif orientation == "vertical":
            query = query.filter(
                and_(
                    self.model.width_cm.isnot(None),
                    self.model.height_cm.isnot(None),
                    self.model.height_cm > self.model.width_cm * 1.1,
                )
            )
        elif orientation == "square":
            query = query.filter(
                and_(
                    self.model.width_cm.isnot(None),
                    self.model.height_cm.isnot(None),
                    self.model.width_cm.between(
                        self.model.height_cm * 0.9, self.model.height_cm * 1.1
                    ),
                )
            )

        if size_category == "small":
            query = query.filter(
                and_(
                    self.model.width_cm.isnot(None),
                    self.model.height_cm.isnot(None),
                    (self.model.width_cm * self.model.height_cm) < 900,
                )
            )
        elif size_category == "medium":
            query = query.filter(
                and_(
                    self.model.width_cm.isnot(None),
                    self.model.height_cm.isnot(None),
                    (self.model.width_cm * self.model.height_cm) >= 900,
                    (self.model.width_cm * self.model.height_cm) <= 3600,
                )
            )
        elif size_category == "large":
            query = query.filter(
                and_(
                    self.model.width_cm.isnot(None),
                    self.model.height_cm.isnot(None),
                    (self.model.width_cm * self.model.height_cm) > 3600,
                )
            )

        return query

    async def get_available_artworks(
        self,
        limit: int = 10,
        offset: int = 0,
        title: str | None = None,
        labels: list[int] | None = None,
        year_from: int | None = None,
        year_to: int | None = None,
        price_min: int | None = None,
        price_max: int | None = None,
        orientation: str | None = None,
        size_category: str | None = None,
    ):
        """
        Retrieves a list of available artworks based on various filters.
        Filters include title (fuzzy), labels, collection, production year, price range,
        aspect ratio (orientation), and surface area (size category).
        """
        query = self._base_query().filter(self.model.id.in_(available_artwork_ids()))
        query = self._apply_common_filters(
            query,
            title=title,
            labels=labels,
            year_from=year_from,
            year_to=year_to,
            price_min=price_min,
            price_max=price_max,
            orientation=orientation,
            size_category=size_category,
        )
        query = query.limit(limit).offset(offset)

        result = await self.session.execute(query)
        return [
            ArtworkWithLabels.model_validate(model, from_attributes=True)
            for model in result.unique().scalars().all()
        ]

    async def get_admin_artworks(
        self,
        limit: int = 10,
        offset: int = 0,
        title: str | None = None,
        labels: list[int] | None = None,
        year_from: int | None = None,
        year_to: int | None = None,
        price_min: int | None = None,
        price_max: int | None = None,
        orientation: str | None = None,
        size_category: str | None = None,
    ):
        query = self._base_query()
        query = self._apply_common_filters(
            query,
            title=title,
            labels=labels,
            year_from=year_from,
            year_to=year_to,
            price_min=price_min,
            price_max=price_max,
            orientation=orientation,
            size_category=size_category,
        )
        query = query.order_by(self.model.id.desc()).limit(limit).offset(offset)
        result = await self.session.execute(query)
        return [
            ArtworkWithLabels.model_validate(model, from_attributes=True)
            for model in result.unique().scalars().all()
        ]

    async def get_one(self, **filter_by):
        query = self._base_query().filter_by(**filter_by)
        result = await self.session.execute(query)
        model = result.unique().scalars().one_or_none()
        if model is None:
            raise ObjectNotFoundException(detail=f"Object not found in {self.model.__tablename__}")
        return ArtworkWithLabels.model_validate(model, from_attributes=True)

    async def get_one_or_none(self, **filter_by):
        """
        Retrieves a single artwork by its fields or returns None if not found.
        Eagerly loads associated labels.
        """
        query = self._base_query().filter_by(**filter_by)
        result = await self.session.execute(query)
        model = result.unique().scalars().one_or_none()
        if model is None:
            return None
        return ArtworkWithLabels.model_validate(model, from_attributes=True)
