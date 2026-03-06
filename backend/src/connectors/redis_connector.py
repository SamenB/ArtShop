import redis.asyncio as redis
from redis.asyncio import Redis as AsyncRedis


class RedisManager:
    def __init__(self, host: str, port: int):
        self.host = host
        self.port = port
        self.redis: AsyncRedis | None = None

    async def connect(self):
        # We use decode_responses=True to get strings instead of bytes
        self.redis = await redis.from_url(f"redis://{self.host}:{self.port}", decode_responses=True)

    async def set(self, key: str, value: str, expire: int | None = None):
        assert self.redis is not None
        await self.redis.set(key, value, ex=expire)

    async def get(self, key: str):
        assert self.redis is not None
        return await self.redis.get(key)

    async def delete(self, key: str):
        assert self.redis is not None
        await self.redis.delete(key)

    async def close(self):
        if self.redis:
            await self.redis.close()
