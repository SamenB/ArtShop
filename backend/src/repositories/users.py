from sqlalchemy import select

from src.models.users import UsersOrm
from src.repositories.base import BaseRepository
from src.repositories.mappers.mappers import UserMapper


class UsersRepository(BaseRepository):
    model = UsersOrm
    mapper = UserMapper

    async def get_user_with_password(self, email: str) -> UsersOrm | None:
        query = select(self.model).filter_by(email=email)
        result = await self.session.execute(query)
        return result.scalars().one_or_none()
