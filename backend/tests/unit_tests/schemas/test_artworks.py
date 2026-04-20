import pytest
from pydantic import ValidationError

from src.schemas.artworks import ArtworkAddRequest


def test_artwork_add_request_valid():
    data = {
        "title": "Mona Lisa",
        "description": "Famous painting",
        "has_paper_print": True,
        "orientation": "Horizontal",
        "labels": [1, 2],
    }
    artwork = ArtworkAddRequest(**data)
    assert artwork.has_paper_print is True
    assert artwork.has_canvas_print is False
    assert artwork.labels == [1, 2]
    assert artwork.original_status == "available"


def test_artwork_add_request_defaults():
    data = {"title": "Minimalist", "orientation": "Vertical"}
    artwork = ArtworkAddRequest(**data)
    assert artwork.title == "Minimalist"
    assert artwork.has_paper_print is False
    assert artwork.has_canvas_print is False
    assert artwork.orientation == "Vertical"
    assert artwork.labels == []


def test_artwork_add_request_missing_title():
    data = {"description": "No title"}
    with pytest.raises(ValidationError) as exc:
        ArtworkAddRequest(**data)
    assert "title" in str(exc.value)
