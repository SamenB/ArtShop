import pytest


@pytest.mark.asyncio
async def test_get_categories(ac):
    response = await ac.get("/labels/categories")
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 2
    titles = [c["title"] for c in data]
    assert "Medium" in titles
    assert "Style" in titles


@pytest.mark.asyncio
async def test_get_labels(ac):
    response = await ac.get("/labels")
    assert response.status_code == 200
    data = response.json()
    titles = [item["title"] for item in data]
    assert "Oil Painting" in titles


@pytest.mark.asyncio
async def test_create_category_api(authenticated_ac):
    response = await authenticated_ac.post(
        "/labels/categories", json={"title": "New Category", "accent_color": "#000000"}
    )
    assert response.status_code == 200
    assert response.json()["status"] == "OK"
    assert response.json()["data"]["title"] == "New Category"


@pytest.mark.asyncio
async def test_create_label_api(authenticated_ac):
    # First get categories to find a valid ID
    cat_resp = await authenticated_ac.get("/labels/categories")
    cat_id = cat_resp.json()[0]["id"]

    response = await authenticated_ac.post(
        "/labels", json={"title": "New Label", "category_id": cat_id}
    )
    assert response.status_code == 200
    assert response.json()["status"] == "OK"
    assert response.json()["data"]["title"] == "New Label"


@pytest.mark.asyncio
async def test_delete_label_api(authenticated_ac):
    # Create a label to delete
    cat_resp = await authenticated_ac.get("/labels/categories")
    cat_id = cat_resp.json()[0]["id"]
    create_resp = await authenticated_ac.post(
        "/labels", json={"title": "Delete Me", "category_id": cat_id}
    )
    label_id = create_resp.json()["data"]["id"]

    # Delete it
    del_resp = await authenticated_ac.delete(f"/labels/{label_id}")
    assert del_resp.status_code == 200

    # Verify it's gone
    get_resp = await authenticated_ac.get("/labels")
    ids = [item["id"] for item in get_resp.json()]
    assert label_id not in ids
