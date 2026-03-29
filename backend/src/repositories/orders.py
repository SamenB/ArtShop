from datetime import date
from typing import Sequence

from loguru import logger
from pydantic import BaseModel
from sqlalchemy import func, insert, select
from sqlalchemy.exc import IntegrityError

from src.exeptions import ObjectAlreadyExistsException
from src.models.orders import OrderItemOrm, OrdersOrm
from src.repositories.base import BaseRepository
from src.repositories.mappers.mappers import OrderItemMapper, OrderMapper


class OrdersRepository(BaseRepository):
    model = OrdersOrm
    mapper = OrderMapper

    async def edit(self, data: BaseModel, exclude_unset: bool = False, **filter_by) -> None:
        from sqlalchemy import update

        update_stmt = (
            update(self.model)
            .filter_by(**filter_by)
            .values(**data.model_dump(exclude={"items"}, exclude_unset=exclude_unset))
        )
        await self.session.execute(update_stmt)

    async def add(self, data: BaseModel | Sequence[BaseModel]) -> BaseModel | Sequence[BaseModel]:
        if isinstance(data, BaseModel):
            data_to_insert = data.model_dump(exclude={"items"})
        else:
            data_to_insert = [sample.model_dump(exclude={"items"}) for sample in data]
        try:
            add_stmt = insert(self.model).values(data_to_insert).returning(self.model)
            result = await self.session.execute(add_stmt)
            if isinstance(data, BaseModel):
                model = result.scalars().one()
                return self.mapper.map_to_schema(model)
            else:
                models = result.scalars().all()
                return [self.mapper.map_to_schema(model) for model in models]
        except IntegrityError as ex:
            logger.warning("IntegrityError in {}: {}", self.model.__tablename__, str(ex))
            raise ObjectAlreadyExistsException() from ex

    async def add_bulk(self, data: list[BaseModel]):
        # Just use the custom `add` implementation that excludes `items`
        data_to_insert = [sample.model_dump(exclude={"items"}) for sample in data]
        try:
            add_stmt = insert(self.model).values(data_to_insert)
            await self.session.execute(add_stmt)
        except IntegrityError as ex:
            logger.warning("IntegrityError bulk in {}: {}", self.model.__tablename__, str(ex))
            raise ObjectAlreadyExistsException() from ex

    async def get_orders_today(self):
        query = select(self.model).where(func.date(self.model.created_at) == date.today())
        res = await self.session.execute(query)
        return [self.mapper.map_to_schema(model) for model in res.scalars().all()]


class OrderItemsRepository(BaseRepository):
    model = OrderItemOrm
    mapper = OrderItemMapper
