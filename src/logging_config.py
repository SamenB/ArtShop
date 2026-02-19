import sys
from pathlib import Path
from loguru import logger

from src.config import settings


def setup_logging():
    # Remove default loguru handler
    logger.remove()

    # Console handler — always on, colored
    if settings.MODE == "PROD":
        # Production: JSON format for log aggregation systems (ELK, Grafana)
        logger.add(
            sys.stdout,
            level=settings.LOG_LEVEL,
            serialize=True,  # JSON output
        )
    else:
        # Development: pretty colored output
        logger.add(
            sys.stdout,
            level=settings.LOG_LEVEL,
            format=(
                "<green>{time:YYYY-MM-DD HH:mm:ss}</green> | "
                "<level>{level: <8}</level> | "
                "<cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> | "
                "<level>{message}</level>"
            ),
        )

    # File handler — log rotation, keeps last 7 days
    log_path = Path("logs")
    log_path.mkdir(exist_ok=True)

    logger.add(
        log_path / "app.log",
        level=settings.LOG_LEVEL,
        rotation="10 MB",       # new file every 10 MB
        retention="7 days",     # delete old files after 7 days
        compression="zip",      # compress rotated files
        serialize=True,         # JSON in files (easy to parse)
    )
