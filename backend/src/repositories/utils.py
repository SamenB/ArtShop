from sqlalchemy import select

from src.models.artworks import ArtworksOrm


def available_artwork_ids():
    query = select(ArtworksOrm.id).where(
        (ArtworksOrm.original_status == "available") | (ArtworksOrm.has_prints == True),
    )
    return query
