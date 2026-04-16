from unittest.mock import AsyncMock, MagicMock

import pytest

from src.schemas.labels import LabelAdd
from src.services.labels import LabelService


class MockDBManager:
    def __init__(self):
        self.labels = AsyncMock()
        self.artwork_labels = AsyncMock()
        self.commit = AsyncMock()
        self.rollback = AsyncMock()


@pytest.fixture
def label_service():
    service = LabelService(MockDBManager())
    return service


@pytest.mark.asyncio
async def test_create_label(label_service):
    mock_label = MagicMock()
    mock_label.id = 10
    mock_label.title = "Cubism"
    label_service.db.labels.add.return_value = mock_label

    data = LabelAdd(title="Cubism", category_id=1)
    result = await label_service.create_label(data)

    assert result.id == 10
    assert result.title == "Cubism"
    label_service.db.labels.add.assert_awaited_once()
    label_service.db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_delete_label(label_service):
    label_id = 10
    await label_service.delete_label(label_id)

    label_service.db.artwork_labels.delete.assert_awaited_once_with(label_id=label_id)
    label_service.db.labels.delete.assert_awaited_once_with(id=label_id)
    label_service.db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_get_label_usage_count(label_service):
    label_id = 10
    label_service.db.artwork_labels.get_filtered.return_value = [MagicMock(), MagicMock()]

    count = await label_service.get_label_usage_count(label_id)

    assert count == 2
    label_service.db.artwork_labels.get_filtered.assert_awaited_once_with(label_id=label_id)
