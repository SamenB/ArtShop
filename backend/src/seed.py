"""
Database seeding utility for development and testing.
Provides a scriptable way to populate the database with a consistent set
of mock artworks, descriptions, and placeholder images.
"""
import asyncio
import os
import sys

# Ensure the backend root is in the system path to support relative 'src' imports.
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from src.database import new_session
from src.models.artworks import ArtworksOrm


async def seed_artworks():
    """
    Generates and persists a batch of test artwork records.

    Generates 40 items with varying attributes:
    - Prices based on index.
    - Alternating availability statuses (available vs. sold).
    - Randomly assigned orientations and base print prices.
    - Placeholder image URLs from picsum.photos for UI testing.
    """
    async with new_session() as session:
        for i in range(1, 41):
            artwork = ArtworksOrm(
                title=f"Test Artwork #{i}",
                description=f"Automated test description for artwork #{i}. Detailed mock content.",
                original_price=i * 10 if i % 3 != 0 else None,
                original_status="available" if i % 2 == 0 else "sold",
                has_prints=True,
                orientation="Horizontal" if i % 2 == 0 else "Vertical",
                base_print_price=i * 5,
                # Use varying seeds to ensure unique placeholder images per artwork.
                images=[
                    f"https://picsum.photos/seed/{i}/800/1000",
                    f"https://picsum.photos/seed/{100 + i}/800/1000",
                    f"https://picsum.photos/seed/{200 + i}/800/1000",
                ],
            )
            session.add(artwork)

        # Commit the batch transaction.
        await session.commit()
    print("Database successfully seeded with 40 test artworks!")


if __name__ == "__main__":
    # Execute the standalone seeding process using the asyncio event loop.
    asyncio.run(seed_artworks())
