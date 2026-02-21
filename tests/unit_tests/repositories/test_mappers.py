import pytest
from src.repositories.mappers.mappers import ArtworkMapper, OrderMapper
from src.models.artworks import ArtworksOrm
from src.models.orders import OrdersOrm
from src.schemas.orders import EditionType
from src.schemas.tags import Tag


def test_artwork_mapper():
    mock_artwork = ArtworksOrm(
        id=1,
        title="Test Art",
        description="A beautiful piece",
        is_display_only=False,
        original_price=1000,
        is_original_available=True,
        print_price=None,
        prints_total=27,
        prints_available=27,
        images=["/test.png"]
    )
    # The mapper typically receives the ORM object and converts to proper Pydantic schema
    # but the mapper requires the relationship to be loaded normally, so we mock it.
    schema = ArtworkMapper.map_to_schema(mock_artwork)
    assert schema.id == 1
    assert schema.title == "Test Art"

def test_order_mapper():
    mock_order = OrdersOrm(
        id=99,
        user_id=1,
        artwork_id=2,
        edition_type="original",
        price=1000
    )
    schema = OrderMapper.map_to_schema(mock_order)
    assert schema.id == 99
    assert schema.edition_type == EditionType.ORIGINAL
    assert schema.price == 1000
