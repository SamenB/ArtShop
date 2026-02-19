from typing import Annotated
from fastapi import Depends, HTTPException, Request, Query
from pydantic import BaseModel

from src.services.auth import AuthService
from src.utils.db_manager import DBManager
from src.database import new_session


class PaginationParams(BaseModel):
    page: int = 1
    per_page: int = 3


PaginationDep = Annotated[PaginationParams, Depends()]


def get_token(request: Request) -> str:
    token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authorized")
    return token


def get_current_user_id(token: str = Depends(get_token)) -> int:
    data = AuthService().decode_access_token(token)
    return data.get("user_id")


UserDep = Annotated[int, Depends(get_current_user_id)]


async def get_db():
    async with DBManager(session_factory=new_session) as db:
        yield db


DBDep = Annotated[DBManager, Depends(get_db)]
