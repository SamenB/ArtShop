import pytest
from pydantic import ValidationError
from src.schemas.artworks import ArtworkAddRequest, ArtworkAdd

def test_artwork_add_request_valid():
    data = {
        "title": "Mona Lisa",
        "description": "Famous painting",
        "is_display_only": False,
        "original_price": 5000000,
        "is_original_available": True,
        "print_price": 50,
        "prints_total": 100,
        "prints_available": 100,
        "tags": [1, 2]
    }
    artwork = ArtworkAddRequest(**data)
    assert artwork.title == "Mona Lisa"
    assert artwork.prints_total == 100
    assert artwork.tags == [1, 2]

def test_artwork_add_request_defaults():
    data = {"title": "Minimalist"}
    artwork = ArtworkAddRequest(**data)
    assert artwork.title == "Minimalist"
    assert artwork.description is None
    assert artwork.is_display_only is False
    assert artwork.is_original_available is True
    assert artwork.prints_total == 27
    assert artwork.prints_available == 27
    assert artwork.tags == []

def test_artwork_add_request_missing_title():
    data = {"description": "No title"}
    with pytest.raises(ValidationError) as exc:
        ArtworkAddRequest(**data)
    assert "title" in str(exc.value)
