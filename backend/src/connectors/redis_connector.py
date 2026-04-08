"""
Redis connection manager for asynchronous operations.
"""

import redis.asyncio as redis
from redis.asyncio import Redis as AsyncRedis


class RedisManager:
    """
    Manages an asynchronous Redis client connection and provides basic CRUD operations.
    """

    def __init__(self, host: str, port: int):
        """
        Initializes the manager with host and port information.
        """
        self.host = host
        self.port = port
        self.redis: AsyncRedis | None = None

    async def connect(self):
        """
        Establishes an asynchronous connection to the Redis server.
        """
        # We use decode_responses=True to get strings instead of bytes
        self.redis = await redis.from_url(f"redis://{self.host}:{self.port}", decode_responses=True)

    async def set(self, key: str, value: str, expire: int | None = None):
        """
        Sets a value in Redis with an optional expiration time in seconds.
        """
        assert self.redis is not None
        await self.redis.set(key, value, ex=expire)

    async def get(self, key: str):
        """
        Retrieves a value from Redis by its key.
        """
        assert self.redis is not None
        return await self.redis.get(key)

    async def delete(self, key: str):
        """
        Deletes a key-value pair from Redis.
        """
        assert self.redis is not None
        await self.redis.delete(key)

    async def close(self):
        """
        Closes the Redis connection if it exists.
        """
        if self.redis:
            await self.redis.close()
