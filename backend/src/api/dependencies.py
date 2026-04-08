"""
Common FastAPI dependencies used across different API routers.
Includes authentication, authorization, and database session management.
"""

from typing import Annotated

from fastapi import Depends, HTTPException, Request
from pydantic import BaseModel

from src.config import settings
from src.database import new_session
from src.init import redis_manager
from src.services.auth import AuthService
from src.utils.db_manager import DBManager


class PaginationParams(BaseModel):
    """
    Standard pagination parameters.
    """

    page: int = 1
    per_page: int = 3


def get_token(request: Request) -> str:
    """
    Extracts the access token from the request cookies.
    Raises 401 if the token is missing.
    """
    token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authorized")
    return token


async def get_current_user_id(token: str = Depends(get_token)) -> int:
    """
    Identifies the currently logged-in user by decoding the access token.
    Checks the Redis blacklist to ensure the token has not been invalidated (e.g., via logout).
    """
    # Check blacklist — access_token might have been invalidated upon logout
    blacklisted = await redis_manager.get(f"at_bl:{token}")
    if blacklisted:
        raise HTTPException(
            status_code=401, detail="Token has been invalidated. Please log in again."
        )
    data = AuthService().decode_access_token(token)
    return data.get("user_id")


async def get_current_user_id_optional(request: Request) -> int | None:
    """
    Optionally identifies the currently logged-in user.
    Returns None if the token is missing, invalid, or blacklisted instead of raising an error.
    """
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
    """
    Dependency that provides an asynchronous database manager instance.
    The session is automatically closed after the request is processed.
    """
    async with DBManager(session_factory=new_session) as db:
        yield db


async def check_admin(
    user_id: int = Depends(get_current_user_id), db: "DBManager" = Depends(get_db)
) -> int:
    """
    Authorization dependency that ensures the current user has administrative privileges.
    Raises 403 if the user is not an administrator.
    """
    user = await db.users.get_one(id=user_id)
    if user.email.lower() not in settings.ADMIN_EMAILS:
        raise HTTPException(status_code=403, detail="Forbidden: Admin access required")
    return user_id


PaginationDep = Annotated[PaginationParams, Depends()]
UserDep = Annotated[int, Depends(get_current_user_id)]
UserDepOptional = Annotated[int | None, Depends(get_current_user_id_optional)]
DBDep = Annotated[DBManager, Depends(get_db)]
AdminDep = Annotated[int, Depends(check_admin)]
