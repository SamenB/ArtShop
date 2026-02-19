from src.models.artworks import ArtworksOrm
from src.models.orders import OrdersOrm
from sqlalchemy import select, func
from datetime import date


def available_artwork_ids(collection_id: int | None = None):
    artworks_count = (
        select(OrdersOrm.artwork_id, func.count("*").label("artworks_ordered"))
        .group_by(OrdersOrm.artwork_id)
        .cte("artworks_count")
    )

    # CTE 2: available_artworks - calculate available artwork quantity
    artworks_available = (
        ArtworksOrm.quantity - func.coalesce(artworks_count.c.artworks_ordered, 0)
    ).label("artworks_available")
    available_artworks = (
        select(ArtworksOrm.id.label("artwork_id"), artworks_available)
        .select_from(ArtworksOrm)
        .outerjoin(artworks_count, ArtworksOrm.id == artworks_count.c.artwork_id)
        .cte("available_artworks")
    )

    # Final query: select artworks with artworks_available > 0 and add filter by collection_id
    artworks_ids_for_collection = select(ArtworksOrm.id)
    if collection_id:
        artworks_ids_for_collection = artworks_ids_for_collection.where(
            ArtworksOrm.collection_id == collection_id
        )

    artworks_ids_to_get = (
        select(available_artworks.c.artwork_id)
        .select_from(available_artworks)
        .where(
            available_artworks.c.artworks_available > 0,
            available_artworks.c.artwork_id.in_(artworks_ids_for_collection),
        )
    )

    return artworks_ids_to_get
