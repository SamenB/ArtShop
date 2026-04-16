import pytest
from sqlalchemy import select

from src.models.labels import ArtworkLabelsOrm, LabelsOrm


@pytest.mark.asyncio
async def test_category_delete_cascades(authenticated_ac, db):
    # 1. Create a category and a label in it
    cat_resp = await authenticated_ac.post(
        "/labels/categories", json={"title": "Cascade Category", "accent_color": "#111111"}
    )
    # The API returns {"data": {...}}
    cat_id = cat_resp.json()["data"]["id"]

    label_resp = await authenticated_ac.post(
        "/labels", json={"title": "Cascade Label", "category_id": cat_id}
    )
    label_id = label_resp.json()["data"]["id"]

    # 2. Delete the category
    del_resp = await authenticated_ac.delete(f"/labels/categories/{cat_id}")
    assert del_resp.status_code == 200

    # 3. Verify label is gone (Cascade)
    # Clear cache before DB check if needed, but here we query DB directly
    query = select(LabelsOrm).where(LabelsOrm.id == label_id)
    res = await db.session.execute(query)
    assert res.scalar() is None
