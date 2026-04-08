"""
Service layer for authentication and security.
Handles JWT token generation (access and refresh pairs), password hashing,
and secure random password generation for OAuth users.
"""
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from pwdlib import PasswordHash

from src.config import settings
from src.exeptions import InvalidTokenException, TokenExpiredException
from src.services.base import BaseService


class AuthService(BaseService):
    """
    Provides cryptographic and token-based security operations.
    Integrates with JWT and pwdlib for robust authentication.
    """

    def __init__(self):
        """
        Initializes the password hashing engine with recommended settings.
        """
        self.password_hash = PasswordHash.recommended()

    # ─── Access Token ──────────────────────────────────────────────────────────

    def create_access_token(self, data: dict) -> str:
        """
        Generates a short-lived JWT access token for user sessions.
        Includes an expiration timestamp and a 'type' claim.
        """
        to_encode = data.copy()
        expire = datetime.now(timezone.utc) + timedelta(
            minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES
        )
        to_encode.update({"exp": expire, "type": "access"})
        return jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)

    def decode_access_token(self, token: str) -> dict:
        """
        Validates and decodes a JWT access token.
        Raises specific exceptions for expiration or invalid signatures.
        """
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
        Generates a long-lived JWT refresh token.
        Includes a unique JTI (JWT ID) for rotation and whitelist tracking in Redis.
        TTL is determined by project settings (default 7 days).
        """
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
        """
        Validates and decodes a JWT refresh token.
        Ensures the 'type' claim matches before returning the payload.
        """
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
        """
        Creates both an access token and a refresh token for a user.
        """
        data = {"user_id": user_id, "username": username}
        access = self.create_access_token(data)
        refresh = self.create_refresh_token(data)
        return access, refresh

    # ─── Password ──────────────────────────────────────────────────────────────

    def hash_password(self, password: str) -> str:
        """
        Generates a secure hash from a plain-text password.
        """
        return self.password_hash.hash(password)

    def verify_password(self, password: str, hashed_password: str) -> bool:
        """
        Verifies a plain-text password against a stored hash.
        """
        return self.password_hash.verify(password, hashed_password)

    @staticmethod
    def make_random_password() -> str:
        """
        Generates a cryptographically secure random hex string.
        Used as a placeholder password for OAuth/Google-registered users.
        """
        return secrets.token_hex(32)
