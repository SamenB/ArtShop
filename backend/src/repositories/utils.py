"""
Utility functions for repository-level queries.
"""
from sqlalchemy import select

from src.models.artworks import ArtworksOrm


def available_artwork_ids():
    """
    Returns a SQLALchemy 'select' statement for retrieving IDs of artworks
    that are either available as originals or have print options enabled.
    """
    query = select(ArtworksOrm.id).where(
        (ArtworksOrm.original_status == "available") | (ArtworksOrm.has_prints == True),
    )
    return query
