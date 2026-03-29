from unittest.mock import AsyncMock, MagicMock

import pytest

from src.schemas.tags import TagAdd
from src.services.tags import TagService


class MockDBManager:
    def __init__(self):
        self.tags = AsyncMock()
        self.commit = AsyncMock()
        self.rollback = AsyncMock()


@pytest.fixture
def tag_service():
    service = TagService(MockDBManager())
    return service


@pytest.mark.asyncio
async def test_create_tag(tag_service):
    mock_tag = MagicMock()
    mock_tag.id = 10
    mock_tag.title = "Cubism"
    tag_service.db.tags.add.return_value = mock_tag

    data = TagAdd(title="Cubism")
    result = await tag_service.create_tag(data)

    assert result.id == 10
    assert result.title == "Cubism"
    tag_service.db.tags.add.assert_awaited_once()
    tag_service.db.commit.assert_awaited_once()
