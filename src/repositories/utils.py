from src.models.artworks import ArtworksOrm
from src.models.orders import OrdersOrm
from sqlalchemy import select, func
from datetime import date


def available_artwork_ids():
    query = select(ArtworksOrm.id).where(
        ArtworksOrm.is_display_only == False,
        (ArtworksOrm.is_original_available == True) | (ArtworksOrm.prints_available > 0)
    )
    return query
