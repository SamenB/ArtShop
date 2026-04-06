"""
Global initialization for application components.
"""
from src.config import settings
from src.connectors.redis_connector import RedisManager

# Global Redis manager instance for shared cache/state
redis_manager = RedisManager(host=settings.REDIS_HOST, port=settings.REDIS_PORT)
