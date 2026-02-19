from fastapi import APIRouter, HTTPException, Response

from src.api.dependencies import UserDep, DBDep
from src.exeptions import (
    ObjectNotFoundException,
    ObjectAlreadyExistsException,
    TokenExpiredException,
    InvalidTokenException,
)
from src.services.auth import AuthService
from src.schemas.users import UserRequestAdd, UserAdd, UserLogin

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register")
async def register_user(user: UserRequestAdd, db: DBDep):
    hashed_password = AuthService().hash_password(user.password)
    new_user_data = UserAdd(
        username=user.username,
        email=user.email,
        hashed_password=hashed_password,
    )
    try:
        await db.users.add(new_user_data)
        await db.commit()
    except ObjectAlreadyExistsException:
        raise HTTPException(status_code=409, detail="User already exists")
    return {"status": "OK"}


@router.post("/login")
async def login_user(data: UserLogin, response: Response, db: DBDep):
    user = await db.users.get_one_or_none(email=data.email)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not AuthService().verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    access_token = AuthService().create_access_token(
        data={"user_id": user.id, "username": user.username}
    )
    response.set_cookie(key="access_token", value=access_token, httponly=True)
    return {"access_token": access_token}


@router.get("/me")
async def get_current_user(user_id: UserDep, db: DBDep):
    try:
        user = await db.users.get_one(id=user_id)
    except (TokenExpiredException, InvalidTokenException):
        raise HTTPException(status_code=401, detail="Not authorized")
    except ObjectNotFoundException:
        raise HTTPException(status_code=401, detail="User not found")
    return {"data": user}


@router.post("/logout")
async def logout_user(response: Response):
    response.delete_cookie(key="access_token")
    return {"status": "OK"}
