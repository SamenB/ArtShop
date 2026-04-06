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

# ─── Ключи Redis ───────────────────────────────────────────────────────────────
#
# Используем ДВЕ разные стратегии для двух типов токенов:
#
# REFRESH TOKEN → WHITELIST:
#   Ключ: "rt:{jti}"  Значение: user_id  TTL: 7 дней
#   При входе — создаём запись. При использовании — удаляем, создаём новую.
#   При logout — удаляем. Нет записи → токен невалиден.
#   Плюс: Redis хранит ТОЛЬКО активные токены, сам чистится по TTL.
#
# ACCESS TOKEN → BLACKLIST (только при logout):
#   Ключ: "at_bl:{token}"  Значение: "1"  TTL: оставшееся время жизни токена
#   Нужен потому что access_token — stateless JWT, и нам нужно
#   аннулировать его ДО истечения TTL при logout.
#   Записей мало: каждая живёт максимум 30 минут и сама исчезает.


def _rt_key(jti: str) -> str:
    return f"rt:{jti}"


def _at_blacklist_key(token: str) -> str:
    return f"at_bl:{token}"


# ─── Cookie helpers ────────────────────────────────────────────────────────────


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    """
    Устанавливает оба токена как httpOnly cookies.
    secure=True только в продакшене (HTTPS). samesite='lax' — защита от CSRF.
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
    response.delete_cookie(key="access_token", path="/")
    response.delete_cookie(key="refresh_token", path="/")


async def _save_refresh_token(jti: str, user_id: int) -> None:
    """Сохраняет refresh token в Redis whitelist при выдаче."""
    ttl = settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60
    await redis_manager.set(_rt_key(jti), str(user_id), expire=ttl)


async def _issue_tokens(response: Response, user_id: int, username: str) -> str:
    """
    Создаёт пару токенов, сохраняет refresh в Redis whitelist, пишет cookies.
    Возвращает access_token (для тела ответа).
    """
    access_token, refresh_token = AuthService().create_token_pair(
        user_id=user_id, username=username
    )
    # Извлекаем jti нового refresh_token чтобы сохранить в Redis
    payload = AuthService().decode_refresh_token(refresh_token)
    await _save_refresh_token(jti=payload["jti"], user_id=user_id)

    _set_auth_cookies(response, access_token, refresh_token)
    return access_token


# ─── Register ─────────────────────────────────────────────────────────────────


@router.post("/register", status_code=201)
async def register_user(user: UserRequestAdd, request: Request, response: Response, db: DBDep):
    """
    Регистрация нового пользователя.
    Rate limit: 10 запросов за 1 час с одного IP.
    Пароль: мин. 8 символов, хотя бы одна буква и одна цифра (валидация на уровне Pydantic).
    После успешной регистрации — сразу авторизован (авто-логин).
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
        # Перехватываем внутреннее исключение и бросаем чистое — без деталей таблицы
        raise UserAlreadyExistsException

    access_token = await _issue_tokens(response, user_id=new_user.id, username=new_user.username)
    return {"status": "OK", "access_token": access_token}


# ─── Login ────────────────────────────────────────────────────────────────────


@router.post("/login")
async def login_user(data: UserLogin, request: Request, response: Response, db: DBDep):
    """
    Логин по email + пароль.
    Rate limit: 5 попыток за 15 минут с одного IP — защита от bruteforce.
    Возвращает access_token (30 мин) + refresh_token (7 дней) в httpOnly cookies.
    """
    await check_rate_limit(request, endpoint="login", max_requests=5, window_seconds=900)

    user = await db.users.get_user_with_password(email=data.email)
    # Одинаковый ответ при неверном email и неверном пароле — не раскрываем, есть ли такой юзер
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not AuthService().verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    access_token = await _issue_tokens(response, user_id=user.id, username=user.username)
    return {"access_token": access_token}


# ─── Refresh ──────────────────────────────────────────────────────────────────


@router.post("/refresh")
async def refresh_tokens(request: Request, response: Response, db: DBDep):
    """
    Обновляет пару токенов (Refresh Token Rotation, WHITELIST схема).

    Схема:
    1. Читаем refresh_token из cookie
    2. Декодируем и проверяем подпись + тип
    3. Проверяем Redis WHITELIST: запись "rt:{jti}" существует?
       - Нет → токен невалиден (уже использован, logout, или подделан) → 401
       - Да → продолжаем
    4. УДАЛЯЕМ старую запись из Redis (токен использован — он одноразовый)
    5. Выдаём новую пару токенов → новый jti → новая запись в Redis whitelist
    """
    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token:
        raise HTTPException(status_code=401, detail="Refresh token missing")

    payload = AuthService().decode_refresh_token(refresh_token)
    jti = payload.get("jti")
    user_id = payload.get("user_id")

    if not jti or not user_id:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    # Проверяем whitelist: есть ли этот jti в Redis?
    stored = await redis_manager.get(_rt_key(jti))
    if not stored:
        # Токена нет в Redis — значит он уже был использован, logout, или истёк.
        # Если кто-то пытается повторно использовать старый rotate-нутый refresh_token —
        # это признак кражи: один пользователь уже обновил, а тут кто-то пришёл со старым.
        raise HTTPException(
            status_code=401, detail="Session expired or already used. Please log in again."
        )

    # Удаляем старую запись — токен использован, он одноразовый
    await redis_manager.delete(_rt_key(jti))

    # Проверяем что пользователь всё ещё существует в БД
    user = await db.users.get_one_or_none(id=user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    # Выдаём новую пару → новый jti автоматически сохраняется в whitelist внутри _issue_tokens
    new_access = await _issue_tokens(response, user_id=user.id, username=user.username)
    return {"access_token": new_access}


# ─── Me ───────────────────────────────────────────────────────────────────────


@router.get("/me", response_model=User)
async def get_current_user(user_id: UserDep, db: DBDep):
    user = await db.users.get_one(id=user_id)
    is_admin = user.email.lower() in settings.ADMIN_EMAILS
    return {"id": user.id, "username": user.username, "email": user.email, "is_admin": is_admin}


# ─── Logout ───────────────────────────────────────────────────────────────────


@router.post("/logout")
async def logout_user(request: Request, response: Response):
    """
    Logout:
    - refresh_token: удаляем из Redis whitelist → токен мгновенно невалиден
    - access_token: добавляем в blacklist до истечения его TTL (максимум 30 мин)
    - Оба cookie удаляются из браузера
    """
    auth_service = AuthService()

    # Инвалидируем refresh_token — удаляем из whitelist
    refresh_token = request.cookies.get("refresh_token")
    if refresh_token:
        try:
            payload = auth_service.decode_refresh_token(refresh_token)
            jti = payload.get("jti")
            if jti:
                await redis_manager.delete(_rt_key(jti))
        except Exception:
            pass  # Токен уже просрочен или невалиден — не страшно

    # Инвалидируем access_token — добавляем в blacklist до конца его TTL
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


# ─── Google OAuth ─────────────────────────────────────────────────────────────


@router.post("/google")
async def google_login(data: GoogleLoginRequest, request: Request, response: Response, db: DBDep):
    """
    Google OAuth — принимает ID Token от фронтенда (Google Sign-In).
    Если пользователь новый — создаёт аккаунт с случайным паролем
    (пользователь не знает пароль, вход только через Google).
    Rate limit: 10 попыток за 5 минут.
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
            # ВАЖНО: случайный пароль — нельзя угадать и войти через /login
            hashed_password=AuthService().hash_password(AuthService.make_random_password()),
        )
        user = await db.users.add(new_user_data)
        await db.commit()

    access_token = await _issue_tokens(response, user_id=user.id, username=user.username)
    return {"access_token": access_token}
