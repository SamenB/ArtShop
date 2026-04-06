"""
API endpoints for user authentication, registration, and token management.
Supports standard email/password login and Google OAuth.
Uses a hybrid approach for token management:
- Refresh Token: Whitelist in Redis (rt:{jti}).
- Access Token: Blacklist in Redis upon logout (at_bl:{token}).
"""
import time

from fastapi import APIRouter, HTTPException, Request, Response
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

from src.api.dependencies import DBDep, UserDep
from src.config import settings
from src.exeptions import ObjectAlreadyExistsException, UserAlreadyExistsException
from src.init import redis_manager
from src.middleware.rate_limit import check_rate_limit
from src.schemas.users import GoogleLoginRequest, User, UserAdd, UserLogin, UserRequestAdd
from src.services.auth import AuthService

router = APIRouter(prefix="/auth", tags=["Authentication"])

# --- Redis Keys Strategy ---
#
# We use two different strategies for the two types of tokens:
#
# REFRESH TOKEN -> WHITELIST:
#   Key: "rt:{jti}"  Value: user_id  TTL: 7 days
#   On login - create entry. On use - delete old, create new.
#   On logout - delete. No entry -> token is invalid.
#   Benefit: Redis only stores active tokens and auto-cleans via TTL.
#
# ACCESS TOKEN -> BLACKLIST (only on logout):
#   Key: "at_bl:{token}"  Value: "1"  TTL: remaining lifetime of the token
#   Needed because access_token is a stateless JWT, and we need
#   to invalidate it BEFORE its TTL expires when a user logs out.
#   Few entries: each lives maximum 30 minutes and auto-disappears.


def _rt_key(jti: str) -> str:
    """
    Returns the Redis key for a refresh token's JTI.
    """
    return f"rt:{jti}"


def _at_blacklist_key(token: str) -> str:
    """
    Returns the Redis key for an access token's blacklist entry.
    """
    return f"at_bl:{token}"


# --- Cookie helpers ---


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    """
    Sets both access and refresh tokens as HTTP-only cookies.
    - secure=True: Only in production (HTTPS).
    - samesite='lax': Protection against CSRF.
    """
    base_params = dict(
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
        path="/",
    )
    response.set_cookie(
        key="access_token",
        value=access_token,
        max_age=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        **base_params,
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        max_age=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        **base_params,
    )


def _clear_auth_cookies(response: Response) -> None:
    """
    Removes authentication cookies from the client browser.
    """
    response.delete_cookie(key="access_token", path="/")
    response.delete_cookie(key="refresh_token", path="/")


async def _save_refresh_token(jti: str, user_id: int) -> None:
    """
    Saves the refresh token JTI in the Redis whitelist upon issuance.
    """
    ttl = settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60
    await redis_manager.set(_rt_key(jti), str(user_id), expire=ttl)


async def _issue_tokens(response: Response, user_id: int, username: str) -> str:
    """
    Generates a new token pair, saves the refresh token to the whitelist, and sets cookies.
    Returns the new access_token.
    """
    access_token, refresh_token = AuthService().create_token_pair(
        user_id=user_id, username=username
    )
    # Extract jti from new refresh_token to save in Redis
    payload = AuthService().decode_refresh_token(refresh_token)
    await _save_refresh_token(jti=payload["jti"], user_id=user_id)

    _set_auth_cookies(response, access_token, refresh_token)
    return access_token


# --- Register ---


@router.post("/register", status_code=201)
async def register_user(user: UserRequestAdd, request: Request, response: Response, db: DBDep):
    """
    Registers a new user.
    Rate limit: 10 requests per 1 hour per IP.
    Automatically logs in the user after successful registration.
    """
    await check_rate_limit(request, endpoint="register", max_requests=10, window_seconds=3600)

    hashed_password = AuthService().hash_password(user.password)
    new_user_data = UserAdd(
        username=user.username,
        email=user.email,
        hashed_password=hashed_password,
    )
    try:
        new_user = await db.users.add(new_user_data)
        await db.commit()
    except ObjectAlreadyExistsException:
        # Catch internal exception and raise a clean user-facing error
        raise UserAlreadyExistsException

    access_token = await _issue_tokens(response, user_id=new_user.id, username=new_user.username)
    return {"status": "OK", "access_token": access_token}


# --- Login ---


@router.post("/login")
async def login_user(data: UserLogin, request: Request, response: Response, db: DBDep):
    """
    Authenticates a user via email and password.
    Rate limit: 5 attempts per 15 minutes per IP (bruteforce protection).
    Returns access_token (30 min) and refresh_token (7 days) in HTTP-only cookies.
    """
    await check_rate_limit(request, endpoint="login", max_requests=5, window_seconds=900)

    user = await db.users.get_user_with_password(email=data.email)
    # Return identical error for wrong email/password to prevent user enumeration
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not AuthService().verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    access_token = await _issue_tokens(response, user_id=user.id, username=user.username)
    return {"access_token": access_token}


# --- Refresh ---


@router.post("/refresh")
async def refresh_tokens(request: Request, response: Response, db: DBDep):
    """
    Refreshes the token pair using Refresh Token Rotation (Whitelist strategy).
    1. Reads refresh_token from cookies.
    2. Validates JTI against current Redis whitelist.
    3. If valid, deletes old JTI and issues a new token pair.
    If the token has already been used or deleted (logout), access is denied.
    """
    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token:
        raise HTTPException(status_code=401, detail="Refresh token missing")

    payload = AuthService().decode_refresh_token(refresh_token)
    jti = payload.get("jti")
    user_id = payload.get("user_id")

    if not jti or not user_id:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    # Check whitelist: is this jti present in Redis?
    stored = await redis_manager.get(_rt_key(jti))
    if not stored:
        # Token missing from Redis: either already used, logged out, or expired.
        # Potential theft signal if someone tries to re-use an old refresh_token.
        raise HTTPException(
            status_code=401, detail="Session expired or already used. Please log in again."
        )

    # Delete old entry as it is single-use
    await redis_manager.delete(_rt_key(jti))

    # Verify user still exists in database
    user = await db.users.get_one_or_none(id=user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    # Issue new pair; new jti is automatically saved to whitelist within _issue_tokens
    new_access = await _issue_tokens(response, user_id=user.id, username=user.username)
    return {"access_token": new_access}


# --- Me ---


@router.get("/me", response_model=User)
async def get_current_user(user_id: UserDep, db: DBDep):
    """
    Returns basic information about the currently authenticated user.
    """
    user = await db.users.get_one(id=user_id)
    is_admin = user.email.lower() in settings.ADMIN_EMAILS
    return {"id": user.id, "username": user.username, "email": user.email, "is_admin": is_admin}


# --- Logout ---


@router.post("/logout")
async def logout_user(request: Request, response: Response):
    """
    Logs out the user by:
    - Deleting the refresh_token from the Redis whitelist.
    - Adding the access_token to the Redis blacklist until its TTL expires.
    - Clearing authentication cookies from the browser.
    """
    auth_service = AuthService()

    # Invalidate refresh_token by removing from whitelist
    refresh_token = request.cookies.get("refresh_token")
    if refresh_token:
        try:
            payload = auth_service.decode_refresh_token(refresh_token)
            jti = payload.get("jti")
            if jti:
                await redis_manager.delete(_rt_key(jti))
        except Exception:
            pass  # Token already expired or invalid: no further action needed

    # Invalidate access_token by adding to blacklist until expiration
    access_token = request.cookies.get("access_token")
    if access_token:
        try:
            payload = auth_service.decode_access_token(access_token)
            exp = payload.get("exp", 0)
            ttl = max(int(exp - time.time()), 1)
            await redis_manager.set(_at_blacklist_key(access_token), "1", expire=ttl)
        except Exception:
            pass

    _clear_auth_cookies(response)
    return {"status": "OK"}


# --- Google OAuth ---


@router.post("/google")
async def google_login(data: GoogleLoginRequest, request: Request, response: Response, db: DBDep):
    """
    Handles Google OAuth login.
    If the user is new, creates a new account with a random password.
    Rate limit: 10 attempts per 5 minutes.
    """
    await check_rate_limit(request, endpoint="google", max_requests=10, window_seconds=300)

    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=500, detail="Google Client ID not configured")

    try:
        id_info = id_token.verify_oauth2_token(
            data.token, google_requests.Request(), settings.GOOGLE_CLIENT_ID
        )
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid Google Token")

    email = id_info.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="Google Token missing email")

    user = await db.users.get_one_or_none(email=email)
    if not user:
        name = id_info.get("name", email.split("@")[0])
        new_user_data = UserAdd(
            username=name,
            email=email,
            # Assign random password: user must login via Google as they won't know the password
            hashed_password=AuthService().hash_password(AuthService.make_random_password()),
        )
        user = await db.users.add(new_user_data)
        await db.commit()

    access_token = await _issue_tokens(response, user_id=user.id, username=user.username)
    return {"access_token": access_token}
