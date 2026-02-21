import asyncio
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.asyncio import AsyncSession

from src.repositories.artworks import ArtworksRepository
from src.repositories.users import UsersRepository
from src.repositories.orders import OrdersRepository
from src.repositories.tags import TagsRepository, ArtworkTagsRepository


class DBManager:
    def __init__(self, session_factory):
        self.session_factory = session_factory

    async def __aenter__(self):
        self.session = self.session_factory()

        self.artworks = ArtworksRepository(self.session)
        self.users = UsersRepository(self.session)
        self.orders = OrdersRepository(self.session)
        self.tags = TagsRepository(self.session)
        self.artwork_tags = ArtworkTagsRepository(self.session)
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if exc_type:  # Rollback only if there was an error
            await self.session.rollback()
        await self.session.close()

    async def commit(self):
        """
        session commit with deadlock exception handling
        """
        for attempt in range(3):
            try:
                await self.session.commit()
                return
            except OperationalError as e:
                if "deadlock" in str(e).lower():
                    await self.session.rollback()
                    if attempt < 2:
                        await asyncio.sleep(0.1 * (attempt + 1))
                        continue
                raise

    async def rollback(self):
        await self.session.rollback()
