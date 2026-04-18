import sys
sys.path.append('C:\\Users\\semen\\Desktop\\Programing\\ArtShop\\backend\\src')
sys.path.append('C:\\Users\\semen\\Desktop\\Programing\\ArtShop\\backend')
import asyncio
import logging
from src.services.artworks import ArtworkService
from src.database import new_session
from src.utils.db_manager import DBManager

async def main():
    async with DBManager(session_factory=new_session) as db:
        try:
            art = await ArtworkService(db).get_all_artworks(limit=10)
            print("OK", len(art))
        except Exception as e:
            logging.exception("FAILED:")

asyncio.run(main())
