"""
Repository for managing artwork data access.
Extends BaseRepository to provide specialized filtering and eager loading of tags.
"""

from sqlalchemy import and_, select
from sqlalchemy.orm import joinedload

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
        artworks_ids_to_get = available_artwork_ids()

        query = (
            select(self.model)
            .options(joinedload(self.model.labels))
            .filter(self.model.id.in_(artworks_ids_to_get))
        )

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

        query = query.limit(limit).offset(offset)

        result = await self.session.execute(query)
        return [
            ArtworkWithLabels.model_validate(model, from_attributes=True)
            for model in result.unique().scalars().all()
        ]

    async def get_one_or_none(self, **filter_by):
        """
        Retrieves a single artwork by its fields or returns None if not found.
        Eagerly loads associated labels.
        """
        query = select(self.model).options(joinedload(self.model.labels)).filter_by(**filter_by)
        result = await self.session.execute(query)
        model = result.unique().scalars().one_or_none()
        if model is None:
            return None
        return ArtworkWithLabels.model_validate(model, from_attributes=True)
