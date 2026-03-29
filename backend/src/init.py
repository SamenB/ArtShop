from src.config import settings
from src.connectors.redis_connector import RedisManager

# Global Redis manager instance
redis_manager = RedisManager(host=settings.REDIS_HOST, port=settings.REDIS_PORT)
