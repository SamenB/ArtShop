from src.repositories.base import BaseRepository
from src.models.orders import OrdersOrm
from src.repositories.mappers.mappers import OrderMapper
from src.exeptions import ObjectNotFoundException
from sqlalchemy import select, func
from datetime import date



class OrdersRepository(BaseRepository):
    model = OrdersOrm
    mapper = OrderMapper



    async def get_orders_today(self):
        query = select(self.model).where(func.date(self.model.created_at) == date.today())
        res = await self.session.execute(query)
        return [self.mapper.map_to_schema(model) for model in res.scalars().all()]
