"""
Logging configuration using the loguru library.
Sets up console and rotating file handlers with environment-specific formatting
and retention policies.
"""

import sys
from pathlib import Path

from loguru import logger

from src.config import settings


def setup_logging():
    """
    Initializes application-wide logging with the following strategies:

    1. Removes the default Loguru standard output handler.
    2. Adds a custom console handler:
       - PROD mode: Serialized JSON output for cloud log aggregators.
       - Other modes: Pretty-printed, color-coded output for developers.
    3. Adds a rotating file handler:
       - Rotates every 10 MB to prevent disk exhaustion.
       - Retains last 7 days of logs.
       - Compresses archived log files into ZIP format.
       - Uses JSON serialization for easy parsing by external tools.
    """
    # Clear any existing global handlers.
    logger.remove()

    # Configure the Console (stdout) handler.
    if settings.MODE == "PROD":
        # Production: Use structured JSON for integration with ELK, Grafana, or Datadog.
        logger.add(
            sys.stdout,
            level=settings.LOG_LEVEL,
            serialize=True,
        )
    else:
        # Development/Test: Use human-readable, colorized output.
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

    # Configure the File handler for persistent logging.
    log_dir = Path("logs")
    log_dir.mkdir(exist_ok=True)

    logger.add(
        log_dir / "app.log",
        level=settings.LOG_LEVEL,
        rotation="10 MB",
        retention="7 days",
        compression="zip",
        serialize=True,
    )
