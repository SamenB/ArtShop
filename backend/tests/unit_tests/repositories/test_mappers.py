from datetime import datetime

from src.models.artworks import ArtworksOrm
from src.models.orders import OrdersOrm
from src.repositories.mappers.mappers import ArtworkMapper, OrderMapper


def test_artwork_mapper():
    mock_artwork = ArtworksOrm(
        id=1,
        title="Test Art",
        description="A beautiful piece",
        is_display_only=False,
        original_price=1000,
        original_status="available",
        prints_total=27,
        prints_available=27,
        images=["/test.png"],
    )
    schema = ArtworkMapper.map_to_schema(mock_artwork)
    assert schema.id == 1
    assert schema.title == "Test Art"


def test_order_mapper():
    mock_order = OrdersOrm(
        id=99,
        user_id=1,
        first_name="Test",
        last_name="User",
        email="test@user.com",
        phone="1234567",
        newsletter_opt_in=False,
        total_price=1000,
        created_at=datetime(2026, 1, 1, 12, 0, 0),
        items=[],
    )
    schema = OrderMapper.map_to_schema(mock_order)
    assert schema.id == 99
    assert schema.total_price == 1000
    assert schema.first_name == "Test"
    assert schema.newsletter_opt_in is False
