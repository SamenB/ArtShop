async def test_add_tags(ac):
    tags = await ac.post(
        "/tags",
        json={
            "title": "Test Tag 2",
        },
    )
    assert tags.status_code == 200
    assert len(tags.json()) > 0


async def test_get_tags(ac):
    tags = await ac.get("/tags")
    assert tags.status_code == 200
    assert len(tags.json()) > 0
