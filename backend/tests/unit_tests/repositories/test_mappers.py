from datetime import datetime

from src.models.artworks import ArtworksOrm
from src.models.orders import OrdersOrm
from src.repositories.mappers.mappers import ArtworkMapper, OrderMapper


def test_artwork_mapper():
    mock_artwork = ArtworksOrm(
        id=1,
        title="Test Art",
        description="A beautiful piece",
        orientation="Horizontal",
        original_price=1000,
        original_status="available",
        has_original=True,
        has_canvas_print=True,
        has_canvas_print_limited=False,
        has_paper_print=True,
        has_paper_print_limited=False,
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
        shipping_country="Ukraine",
        shipping_country_code="UA",
        shipping_city="Kyiv",
        shipping_address_line1="Test St 1",
        shipping_postal_code="01001",
        total_price=1000,
        payment_status="pending",
        fulfillment_status="pending",
        created_at=datetime(2026, 1, 1, 12, 0, 0),
        items=[],
    )
    schema = OrderMapper.map_to_schema(mock_order)
    assert schema.id == 99
    assert schema.total_price == 1000
    assert schema.first_name == "Test"
    assert schema.newsletter_opt_in is False
