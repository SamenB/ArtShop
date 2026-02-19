async def test_get_collections(ac):
    collections = await ac.get(
        "/collections"
    )
    assert collections.status_code == 200
    assert len(collections.json()) > 0
