from sqlalchemy import select

from src.models.artworks import ArtworksOrm


def available_artwork_ids():
    query = select(ArtworksOrm.id).where(
        ArtworksOrm.is_display_only == False,
        (ArtworksOrm.original_status == "available") | (ArtworksOrm.prints_available > 0),
    )
    return query
