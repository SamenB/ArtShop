from fastapi import APIRouter, HTTPException, Response
from google.auth.transport import requests
from google.oauth2 import id_token

from src.api.dependencies import DBDep, UserDep
from src.config import settings
from src.schemas.users import GoogleLoginRequest, User, UserAdd, UserLogin, UserRequestAdd
from src.services.auth import AuthService

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register")
async def register_user(user: UserRequestAdd, db: DBDep):
    hashed_password = AuthService().hash_password(user.password)
    new_user_data = UserAdd(
        username=user.username,
        email=user.email,
        hashed_password=hashed_password,
    )
    await db.users.add(new_user_data)
    await db.commit()
    return {"status": "OK"}


@router.post("/login")
async def login_user(data: UserLogin, response: Response, db: DBDep):
    user = await db.users.get_user_with_password(email=data.email)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not AuthService().verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    access_token = AuthService().create_access_token(
        data={"user_id": user.id, "username": user.username}
    )
    response.set_cookie(key="access_token", value=access_token, httponly=True)
    return {"access_token": access_token}


@router.get("/me", response_model=User)
async def get_current_user(user_id: UserDep, db: DBDep):
    user = await db.users.get_one(id=user_id)
    is_admin = user.email.lower() in settings.ADMIN_EMAILS
    return {"id": user.id, "username": user.username, "email": user.email, "is_admin": is_admin}


@router.post("/logout")
async def logout_user(response: Response):
    response.delete_cookie(key="access_token")
    return {"status": "OK"}


@router.post("/google")
async def google_login(data: GoogleLoginRequest, response: Response, db: DBDep):
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=500, detail="Google Client ID not configured")
    try:
        id_info = id_token.verify_oauth2_token(
            data.token, requests.Request(), settings.GOOGLE_CLIENT_ID
        )
        email = id_info.get("email")
        if not email:
            raise HTTPException(status_code=400, detail="Google Token missing email")

        user = await db.users.get_one_or_none(email=email)
        if not user:
            name = id_info.get("name", email.split("@")[0])
            new_user_data = UserAdd(
                username=name,
                email=email,
                hashed_password=AuthService().hash_password("google_oauth_dummy"),
            )
            user = await db.users.add(new_user_data)
            await db.commit()

        access_token = AuthService().create_access_token(
            data={"user_id": user.id, "username": user.username}
        )
        response.set_cookie(key="access_token", value=access_token, httponly=True)
        return {"access_token": access_token}
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid Google Token")
