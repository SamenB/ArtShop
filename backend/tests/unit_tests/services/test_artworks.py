from unittest.mock import AsyncMock, MagicMock

import pytest

from src.exeptions import ObjectAlreadyExistsException
from src.schemas.artworks import ArtworkAddRequest
from src.services.artworks import ArtworkService


class MockDBManager:
    def __init__(self):
        self.artworks = AsyncMock()
        self.artworks.get_one_or_none.return_value = None
        self.artwork_labels = AsyncMock()
        self.commit = AsyncMock()
        self.rollback = AsyncMock()


@pytest.fixture
def artwork_service():
    service = ArtworkService(MockDBManager())
    return service


@pytest.mark.asyncio
async def test_get_artwork_by_id(artwork_service):
    mock_artwork = MagicMock()
    mock_artwork.id = 1
    artwork_service.db.artworks.get_one.return_value = mock_artwork

    result = await artwork_service.get_artwork_by_id(1)

    assert result.id == 1
    artwork_service.db.artworks.get_one.assert_awaited_once_with(id=1)


@pytest.mark.asyncio
async def test_create_artwork(artwork_service):
    mock_artwork = MagicMock()
    mock_artwork.id = 5
    artwork_service.db.artworks.add.return_value = mock_artwork

    # Create Mock Data
    data = {
        "title": "A new painting",
        "description": "...",
        "orientation": "Vertical",
        "labels": [1, 2],
    }
    artwork_data = ArtworkAddRequest(**data)

    result = await artwork_service.create_artwork(artwork_data)

    assert result.id == 5
    artwork_service.db.artworks.add.assert_awaited_once()
    artwork_service.db.artwork_labels.add_bulk.assert_awaited_once()  # two labels
    artwork_service.db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_create_artwork_duplicate_fails(artwork_service):
    # Setup mock to raise ObjectAlreadyExistsException
    artwork_service.db.artworks.add.side_effect = ObjectAlreadyExistsException()

    data = {"title": "Duplicate", "description": "...", "orientation": "Horizontal", "labels": []}
    artwork_data = ArtworkAddRequest(**data)

    with pytest.raises(ObjectAlreadyExistsException):
        await artwork_service.create_artwork(artwork_data)

    # Commit shouldn't be called if it failed
    artwork_service.db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_delete_artwork(artwork_service):
    artwork_service.db.artworks.get_one.return_value = MagicMock()

    await artwork_service.delete_artwork(1)

    artwork_service.db.artworks.delete.assert_awaited_once_with(id=1)
    artwork_service.db.commit.assert_awaited_once()
