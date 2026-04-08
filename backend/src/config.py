"""
Global application configuration and environment variable management.
Uses pydantic-settings to load and validate configuration from .env files
and system environment variables.
"""

import json
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Central settings object for the backend application.
    Defines database connections, security keys, and external service credentials.
    """

    MODE: Literal["TEST", "LOCAL", "DEV", "PROD"] = "LOCAL"
    LOG_LEVEL: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = "DEBUG"

    # Database (PostgreSQL) Configuration
    POSTGRES_DB: str
    POSTGRES_USER: str
    POSTGRES_PASSWORD: str
    DB_HOST: str
    DB_PORT: int

    # Redis Configuration
    REDIS_HOST: str
    REDIS_PORT: int

    @property
    def REDIS_URL(self) -> str:
        """
        Returns the formatted Redis connection URL for the broker and cache.
        """
        return f"redis://{self.REDIS_HOST}:{self.REDIS_PORT}"

    @property
    def DB_URL(self) -> str:
        """
        Returns the formatted PostgreSQL connection URL for SQLAlchemy.
        Uses the asyncpg driver for asynchronous operations.
        """
        return f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.DB_HOST}:{self.DB_PORT}/{self.POSTGRES_DB}"

    # Authentication (JWT) Configuration
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Cookie Security Settings
    # Use False for local development without HTTPS; True for production.
    COOKIE_SECURE: bool = False
    COOKIE_SAMESITE: str = "lax"

    # Administrative settings
    ADMIN_EMAILS: list[str] = []

    @field_validator("ADMIN_EMAILS", mode="before")
    @classmethod
    def parse_admin_emails(cls, v):
        """
        Parses administrator emails from various string formats.
        Supports both JSON arrays and comma-separated lists.
        """
        if isinstance(v, str):
            try:
                # Attempt to parse as a JSON-formatted array.
                parsed = json.loads(v)
                if isinstance(parsed, list):
                    return [str(email).strip().lower() for email in parsed]
            except json.JSONDecodeError:
                pass
            # Fallback to comma-separated string format.
            return [email.strip().lower() for email in v.split(",") if email.strip()]
        return v

    # External Integrations
    GOOGLE_CLIENT_ID: str | None = None

    # SMTP (Email) Configuration
    SMTP_HOST: str | None = None
    SMTP_PORT: int = 465
    SMTP_USER: str | None = None
    SMTP_PASSWORD: str | None = None

    # CORS Policy Configuration
    # Whitelist of allowed origins for browser-based requests.
    CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "https://samen-bondarenko.com",
        "https://www.samen-bondarenko.com",
    ]

    # Configuration for loading environment variables.
    model_config = SettingsConfigDict(
        env_file="../.env",  # Relative path from the src directory.
        env_file_encoding="utf-8",
        extra="ignore",  # Allows sharing .env with frontend without validation errors.
    )


# Instantiate the settings object for global use across the application.
settings = Settings()  # type: ignore[call-arg]
