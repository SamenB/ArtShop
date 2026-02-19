from src.repositories.base import BaseRepository
from src.models.users import UsersOrm
from src.repositories.mappers.mappers import UserMapper


class UsersRepository(BaseRepository):
    model = UsersOrm
    mapper = UserMapper
