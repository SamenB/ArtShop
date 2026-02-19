from src.schemas.collections import CollectionAdd


async def test_add_collection(db):
    collection_data = CollectionAdd(title="Test Collection", location="Test Location")
    await db.collections.add(collection_data)
    await db.commit()
