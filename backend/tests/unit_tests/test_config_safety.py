import pytest

from src.config import Settings


def make_settings(**overrides):
    payload = {
        "MODE": "LOCAL",
        "LOG_LEVEL": "DEBUG",
        "POSTGRES_DB": "artshop",
        "POSTGRES_USER": "postgres",
        "POSTGRES_PASSWORD": "postgres",
        "DB_HOST": "localhost",
        "DB_PORT": 5432,
        "REDIS_HOST": "localhost",
        "REDIS_PORT": 6379,
        "JWT_SECRET_KEY": "test-secret",
        "JWT_ALGORITHM": "HS256",
        "JWT_ACCESS_TOKEN_EXPIRE_MINUTES": 30,
    }
    payload.update(overrides)
    return Settings(**payload)


def test_settings_reject_test_mode_against_non_test_database_name() -> None:
    with pytest.raises(
        ValueError, match="refuses to run against a non-test PostgreSQL database name"
    ):
        make_settings(MODE="TEST", POSTGRES_DB="artshop")


def test_settings_accept_test_mode_for_safe_database_name() -> None:
    settings = make_settings(MODE="TEST", POSTGRES_DB="test_artshop")

    assert settings.ACTIVE_POSTGRES_DB == "test_artshop"
    assert settings.DB_URL.endswith("/test_artshop")


def test_settings_use_explicit_test_database_override() -> None:
    settings = make_settings(
        MODE="TEST",
        POSTGRES_DB="artshop",
        TEST_POSTGRES_DB="artshop_test",
    )

    assert settings.ACTIVE_POSTGRES_DB == "artshop_test"
    assert settings.DB_URL.endswith("/artshop_test")
