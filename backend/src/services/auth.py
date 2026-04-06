import secrets
from datetime import datetime, timedelta, timezone

import jwt
from pwdlib import PasswordHash

from src.config import settings
from src.exeptions import InvalidTokenException, TokenExpiredException
from src.services.base import BaseService


class AuthService(BaseService):
    def __init__(self):
        self.password_hash = PasswordHash.recommended()

    # ─── Access Token ──────────────────────────────────────────────────────────

    def create_access_token(self, data: dict) -> str:
        to_encode = data.copy()
        expire = datetime.now(timezone.utc) + timedelta(
            minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES
        )
        to_encode.update({"exp": expire, "type": "access"})
        return jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)

    def decode_access_token(self, token: str) -> dict:
        try:
            payload = jwt.decode(
                token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
            )
            if payload.get("type") != "access":
                raise InvalidTokenException
            return payload
        except jwt.ExpiredSignatureError:
            raise TokenExpiredException
        except jwt.InvalidTokenError:
            raise InvalidTokenException

    # ─── Refresh Token ─────────────────────────────────────────────────────────

    def create_refresh_token(self, data: dict) -> str:
        """
        Refresh token — opaque JWT с TTL 7 дней.
        Хранится в Redis; при использовании инвалидируется (rotation).
        """
        # jti — уникальный ID токена (для whitelist/rotation)
        now = datetime.now(timezone.utc)
        to_encode = data.copy()
        to_encode.update(
            {
                "exp": now + timedelta(days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS),
                "type": "refresh",
                "jti": secrets.token_hex(16),
            }
        )
        return jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)

    def decode_refresh_token(self, token: str) -> dict:
        try:
            payload = jwt.decode(
                token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
            )
            if payload.get("type") != "refresh":
                raise InvalidTokenException
            return payload
        except jwt.ExpiredSignatureError:
            raise TokenExpiredException
        except jwt.InvalidTokenError:
            raise InvalidTokenException

    def create_token_pair(self, user_id: int, username: str) -> tuple[str, str]:
        """Создаёт пару access + refresh токенов для пользователя."""
        data = {"user_id": user_id, "username": username}
        access = self.create_access_token(data)
        refresh = self.create_refresh_token(data)
        return access, refresh

    # ─── Password ──────────────────────────────────────────────────────────────

    def hash_password(self, password: str) -> str:
        return self.password_hash.hash(password)

    def verify_password(self, password: str, hashed_password: str) -> bool:
        return self.password_hash.verify(password, hashed_password)

    @staticmethod
    def make_random_password() -> str:
        """Генерирует криптографически случайный пароль для OAuth-пользователей."""
        return secrets.token_hex(32)
