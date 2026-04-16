from unittest.mock import AsyncMock, MagicMock

import pytest

from src.schemas.labels import LabelCategoryAdd
from src.services.labels import LabelService


class MockDBManager:
    def __init__(self):
        self.label_categories = AsyncMock()
        self.commit = AsyncMock()
        self.rollback = AsyncMock()


@pytest.fixture
def label_service():
    service = LabelService(MockDBManager())
    return service


@pytest.mark.asyncio
async def test_create_category(label_service):
    mock_cat = MagicMock()
    mock_cat.id = 1
    mock_cat.title = "Medium"
    label_service.db.label_categories.add.return_value = mock_cat

    data = LabelCategoryAdd(title="Medium", accent_color="#ffffff")
    result = await label_service.create_category(data)

    assert result.id == 1
    assert result.title == "Medium"
    label_service.db.label_categories.add.assert_awaited_once()
    label_service.db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_get_all_categories(label_service):
    label_service.db.label_categories.get_all.return_value = [MagicMock(), MagicMock()]

    result = await label_service.get_all_categories()

    assert len(result) == 2
    label_service.db.label_categories.get_all.assert_awaited_once()


@pytest.mark.asyncio
async def test_delete_category(label_service):
    cat_id = 1
    await label_service.delete_category(cat_id)

    label_service.db.label_categories.delete.assert_awaited_once_with(id=cat_id)
    label_service.db.commit.assert_awaited_once()
