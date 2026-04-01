import asyncio
import os
import sys

# Add backend directory to sis.path to allow imports like `from src...`
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from src.database import new_session
from src.models.artworks import ArtworksOrm


async def seed_artworks():
    async with new_session() as session:
        for i in range(1, 41):
            artwork = ArtworksOrm(
                title=f"Test Artwork #{i}",
                description=f"This is a description for Test Artwork #{i}. Full of details.",
                original_price=i * 10 if i % 3 != 0 else None,
                original_status="available" if i % 2 == 0 else "sold",
                has_prints=True,
                orientation="Horizontal" if i % 2 == 0 else "Vertical",
                base_print_price=i * 5,
                images=[
                    f"https://picsum.photos/seed/{i}/800/1000",
                    f"https://picsum.photos/seed/{100 + i}/800/1000",
                    f"https://picsum.photos/seed/{200 + i}/800/1000",
                ],
            )
            session.add(artwork)
        await session.commit()
    print("Successfully seeded 40 test artworks!")


if __name__ == "__main__":
    asyncio.run(seed_artworks())
