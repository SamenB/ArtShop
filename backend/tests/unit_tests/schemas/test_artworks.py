import pytest
from pydantic import ValidationError

from src.schemas.artworks import ArtworkAddRequest


def test_artwork_add_request_valid():
    data = {
        "title": "Mona Lisa",
        "description": "Famous painting",
        "has_prints": False,
        "orientation": "Horizontal",
        "base_print_price": 100,
        "tags": [1, 2],
    }
    artwork = ArtworkAddRequest(**data)
    assert artwork.has_prints is False
    assert artwork.tags == [1, 2]
    assert artwork.original_status == "available"


def test_artwork_add_request_defaults():
    data = {"title": "Minimalist"}
    artwork = ArtworkAddRequest(**data)
    assert artwork.title == "Minimalist"
    assert artwork.has_prints is False
    assert artwork.base_print_price is None
    assert artwork.orientation is None
    assert artwork.tags == []


def test_artwork_add_request_missing_title():
    data = {"description": "No title"}
    with pytest.raises(ValidationError) as exc:
        ArtworkAddRequest(**data)
    assert "title" in str(exc.value)
