from typing import Annotated

from fastapi import Depends, HTTPException, Request
from pydantic import BaseModel

from src.config import settings
from src.database import new_session
from src.init import redis_manager
from src.services.auth import AuthService
from src.utils.db_manager import DBManager


class PaginationParams(BaseModel):
    page: int = 1
    per_page: int = 3


def get_token(request: Request) -> str:
    token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authorized")
    return token


async def get_current_user_id(token: str = Depends(get_token)) -> int:
    # Проверяем blacklist — access_token мог быть инвалидирован при logout
    blacklisted = await redis_manager.get(f"at_bl:{token}")
    if blacklisted:
        raise HTTPException(
            status_code=401, detail="Token has been invalidated. Please log in again."
        )
    data = AuthService().decode_access_token(token)
    return data.get("user_id")


async def get_current_user_id_optional(request: Request) -> int | None:
    token = request.cookies.get("access_token")
    if not token:
        return None
    try:
        blacklisted = await redis_manager.get(f"at_bl:{token}")
        if blacklisted:
            return None
        data = AuthService().decode_access_token(token)
        return data.get("user_id")
    except Exception:
        return None


async def get_db():
    async with DBManager(session_factory=new_session) as db:
        yield db


async def check_admin(
    user_id: int = Depends(get_current_user_id), db: "DBManager" = Depends(get_db)
) -> int:
    user = await db.users.get_one(id=user_id)
    if user.email.lower() not in settings.ADMIN_EMAILS:
        raise HTTPException(status_code=403, detail="Forbidden: Admin access required")
    return user_id


PaginationDep = Annotated[PaginationParams, Depends()]
UserDep = Annotated[int, Depends(get_current_user_id)]
UserDepOptional = Annotated[int | None, Depends(get_current_user_id_optional)]
DBDep = Annotated[DBManager, Depends(get_db)]
AdminDep = Annotated[int, Depends(check_admin)]
