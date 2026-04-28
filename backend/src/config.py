"""
Global application configuration and environment variable management.
Uses pydantic-settings to load and validate configuration from .env files
and system environment variables.
"""

import json
from typing import Literal

from pydantic import field_validator, model_validator
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
    TEST_POSTGRES_DB: str | None = None
    TEST_POSTGRES_USER: str | None = None
    TEST_POSTGRES_PASSWORD: str | None = None
    TEST_DB_HOST: str | None = None
    TEST_DB_PORT: int | None = None

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
    def ACTIVE_POSTGRES_DB(self) -> str:
        if self.MODE == "TEST":
            return self.TEST_POSTGRES_DB or self.POSTGRES_DB
        return self.POSTGRES_DB

    @property
    def ACTIVE_POSTGRES_USER(self) -> str:
        if self.MODE == "TEST":
            return self.TEST_POSTGRES_USER or self.POSTGRES_USER
        return self.POSTGRES_USER

    @property
    def ACTIVE_POSTGRES_PASSWORD(self) -> str:
        if self.MODE == "TEST":
            return self.TEST_POSTGRES_PASSWORD or self.POSTGRES_PASSWORD
        return self.POSTGRES_PASSWORD

    @property
    def ACTIVE_DB_HOST(self) -> str:
        if self.MODE == "TEST":
            return self.TEST_DB_HOST or self.DB_HOST
        return self.DB_HOST

    @property
    def ACTIVE_DB_PORT(self) -> int:
        if self.MODE == "TEST":
            return self.TEST_DB_PORT or self.DB_PORT
        return self.DB_PORT

    @property
    def DB_URL(self) -> str:
        """
        Returns the formatted PostgreSQL connection URL for SQLAlchemy.
        Uses the asyncpg driver for asynchronous operations.
        """
        return (
            "postgresql+asyncpg://"
            f"{self.ACTIVE_POSTGRES_USER}:{self.ACTIVE_POSTGRES_PASSWORD}"
            f"@{self.ACTIVE_DB_HOST}:{self.ACTIVE_DB_PORT}/{self.ACTIVE_POSTGRES_DB}"
        )

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

    @model_validator(mode="after")
    def validate_test_database_safety(self) -> "Settings":
        if self.MODE == "TEST":
            self.ensure_safe_test_database()
        return self

    def is_safe_test_database_name(self, db_name: str | None = None) -> bool:
        normalized = (db_name or self.ACTIVE_POSTGRES_DB).strip().lower()
        if not normalized:
            return False
        return (
            normalized.startswith("test_")
            or normalized.endswith("_test")
            or normalized in {"pytest", "tests"}
        )

    def ensure_safe_test_database(self, db_name: str | None = None) -> None:
        normalized = (db_name or self.ACTIVE_POSTGRES_DB).strip().lower()
        if self.MODE != "TEST":
            raise ValueError("Destructive test-database operations are only allowed in MODE=TEST.")
        if self.is_safe_test_database_name(normalized):
            return
        raise ValueError(
            "MODE=TEST refuses to run against a non-test PostgreSQL database name. "
            f"Resolved database: '{normalized}'. Use a database like 'test_artshop' or "
            "'artshop_test', or set TEST_POSTGRES_DB explicitly."
        )

    # External Integrations
    GOOGLE_CLIENT_ID: str | None = None

    # SMTP (Email) Configuration
    SMTP_HOST: str | None = None
    SMTP_PORT: int = 465
    SMTP_USER: str | None = None
    SMTP_PASSWORD: str | None = None

    # Monobank Acquiring (Payment Gateway) Configuration
    # Test token from https://api.monobank.ua/ ; production token from https://web.monobank.ua/
    MONOBANK_TOKEN: str | None = None
    MONOBANK_API_URL: str = "https://api.monobank.ua"
    # Public-facing URL where Monobank sends webhook callbacks on payment status changes.
    MONOBANK_WEBHOOK_URL: str | None = None
    # URL to redirect the buyer after payment completion (success or failure).
    MONOBANK_REDIRECT_URL: str | None = None

    # URL used for generating absolute links for external services (Prodigi, etc.)
    # In production, this should be https://your-domain.com
    PUBLIC_BASE_URL: str = "http://localhost:8000"

    # Active print-on-demand provider adapter used by the domain-facing backend.
    # Provider-specific code should stay behind the print_on_demand abstraction.
    PRINT_PROVIDER: Literal["prodigi"] = "prodigi"

    # --- Telegram Bot Integration ---
    # Bot token from @BotFather — used for both admin notifications and print partner orders.
    TELEGRAM_BOT_TOKEN: str | None = None
    # Your personal or group chat_id where new order alerts are delivered.
    # Obtain your chat_id by messaging @userinfobot in Telegram.
    TELEGRAM_ADMIN_CHAT_ID: str | None = None
    # --- Prodigi Print-on-Demand ---
    # API key from https://dashboard.prodigi.com/settings/api
    PRODIGI_API_KEY: str | None = None
    # Set to True to use sandbox (https://api.sandbox.prodigi.com) instead of live.
    PRODIGI_SANDBOX: bool = False
    # Optional shared secret added to Prodigi callback URLs and checked on webhook receipt.
    PRODIGI_WEBHOOK_SECRET: str | None = None

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
