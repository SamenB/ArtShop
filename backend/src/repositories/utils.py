"""
Utility functions for repository-level queries.
"""

from sqlalchemy import select

from src.models.artworks import ArtworksOrm


def available_artwork_ids():
    """
    Returns a SQLAlchemy 'select' statement for retrieving IDs of artworks
    that are publicly purchasable — i.e. have at least one active offering:
    an original for sale or any of the four print types enabled.
    """
    query = select(ArtworksOrm.id).where(
        (ArtworksOrm.original_status == "available")
        | (ArtworksOrm.has_canvas_print == True)
        | (ArtworksOrm.has_canvas_print_limited == True)
        | (ArtworksOrm.has_paper_print == True)
        | (ArtworksOrm.has_paper_print_limited == True)
    )
    return query


def shop_artwork_ids():
    """
    Returns public shop IDs: explicitly shop-visible artworks with at least one
    purchasable offering.
    """
    return available_artwork_ids().where(ArtworksOrm.show_in_shop.is_(True))


def gallery_artwork_ids():
    """
    Returns public gallery IDs. Gallery visibility is intentionally independent
    from sale/print readiness so archive works and sketches can be shown.
    """
    return select(ArtworksOrm.id).where(ArtworksOrm.show_in_gallery.is_(True))
