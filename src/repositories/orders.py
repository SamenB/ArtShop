from src.repositories.base import BaseRepository
from src.models.orders import OrdersOrm
from src.repositories.mappers.mappers import OrderMapper
from src.schemas.orders import OrderAddRequest, OrderAdd
from src.exeptions import ObjectNotFoundException, AllArtworksSoldOutException
from sqlalchemy import select, func
from datetime import date



class OrdersRepository(BaseRepository):
    model = OrdersOrm
    mapper = OrderMapper

    async def create_order(self, order_data: OrderAddRequest, user_id: int, db):
        """Validate availability and create order."""
        # 1. Check if artwork exists
        try:
            artwork = await db.artworks.get_one(id=order_data.artwork_id)
        except ObjectNotFoundException:
            raise ObjectNotFoundException

        # 2. Check artwork availability
        available_artworks = await db.artworks.get_available_artworks(
            collection_id=artwork.collection_id,
        )
        available_ids = [a.id for a in available_artworks]
        if order_data.artwork_id not in available_ids:
            raise AllArtworksSoldOutException

        # 3. Create order
        order = await self.add(
            OrderAdd(
                **order_data.model_dump(),
                collection_id=artwork.collection_id,
                user_id=user_id,
                price=artwork.price,
            )
        )
        return order

    async def get_orders_today(self):
        query = select(self.model).where(func.date(self.model.created_at) == date.today())
        res = await self.session.execute(query)
        return [self.mapper.map_to_schema(model) for model in res.scalars().all()]
