import json
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    MODE: Literal["TEST", "LOCAL", "DEV", "PROD"] = "LOCAL"
    LOG_LEVEL: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = "DEBUG"
    POSTGRES_DB: str
    POSTGRES_USER: str
    POSTGRES_PASSWORD: str
    DB_HOST: str
    DB_PORT: int
    REDIS_HOST: str
    REDIS_PORT: int

    @property
    def REDIS_URL(self):
        return f"redis://{self.REDIS_HOST}:{self.REDIS_PORT}"

    @property
    def DB_URL(self):
        return f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.DB_HOST}:{self.DB_PORT}/{self.POSTGRES_DB}"

    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int
    ADMIN_EMAILS: list[str] = []

    @field_validator("ADMIN_EMAILS", mode="before")
    @classmethod
    def parse_admin_emails(cls, v):
        if isinstance(v, str):
            try:
                # Try parsing as JSON array
                parsed = json.loads(v)
                if isinstance(parsed, list):
                    return [str(email).strip().lower() for email in parsed]
            except json.JSONDecodeError:
                pass
            # Fallback to comma-separated string
            return [email.strip().lower() for email in v.split(",") if email.strip()]
        return v

    GOOGLE_CLIENT_ID: str | None = None

    # CORS Origins (useful for Local Dev -> Prod transitions)
    CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
    ]

    # to load env variables from .env file
    model_config = SettingsConfigDict(
        env_file="../.env",
        env_file_encoding="utf-8",
        extra="ignore",  # Safe: we share .env between backend and frontend
    )


settings = Settings()  # type: ignore[call-arg]
