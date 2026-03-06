from src.schemas.tags import TagAdd


async def test_add_tags(db):
    tag = await db.tags.add(TagAdd(title="Test Tag"))
    await db.commit()
    assert tag.id is not None
    assert tag.title == "Test Tag"


async def test_get_tags(db):
    tags = await db.tags.get_all()
    assert len(tags) > 0
