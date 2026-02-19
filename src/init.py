from src.connectors.redis_connector import RedisManager
from src.config import settings


# Global Redis manager instance
redis_manager = RedisManager(host=settings.REDIS_HOST, port=settings.REDIS_PORT)
