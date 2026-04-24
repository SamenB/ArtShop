from __future__ import annotations

import asyncio
from pprint import pprint

from src.database import new_session_null_pool
from src.services.prodigi_csv_storefront_rebuild import (
    ProdigiCsvStorefrontRebuildService,
)
from src.utils.db_manager import DBManager


async def main() -> None:
    async with DBManager(session_factory=new_session_null_pool) as db:
        result = await ProdigiCsvStorefrontRebuildService(db).rebuild()
        pprint(result)


if __name__ == "__main__":
    asyncio.run(main())
