import asyncio
import sys
import traceback

sys.path.insert(0, ".")

from src.database import new_session
from src.services.orders import OrderService
from src.utils.db_manager import DBManager

async def run():
    async with new_session() as session:
        db = DBManager(lambda: session)
        await db.__aenter__()
        try:
            # Bypass auth, call the service directly
            await OrderService(db).submit_order_to_print_provider(32)
            print("SUCCESS")
        except Exception as e:
            print("ERROR CAUGHT IN SCRIPT:")
            traceback.print_exc()
        finally:
            await db.__aexit__(None, None, None)

asyncio.run(run())
