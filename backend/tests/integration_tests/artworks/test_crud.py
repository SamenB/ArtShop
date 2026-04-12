from httpx import AsyncClient


class TestArtworkCRUD:
    """Integration tests for Artwork CRUD operations."""

    async def test_get_artworks(self, ac: AsyncClient):
        """GET /artworks returns a list of artworks."""
        resp = await ac.get("/artworks")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 7  # Based on mock data

    async def test_get_artwork_by_slug(self, ac: AsyncClient):
        """GET /artworks/{slug} returns a single artwork."""
        resp = await ac.get("/artworks/starry-night")
        assert resp.status_code == 200
        assert resp.json()["title"] == "Starry Night"

    async def test_create_artwork_admin(self, authenticated_ac: AsyncClient):
        """POST /artworks creates a new artwork (admin only)."""
        payload = {
            "title": "Test Artwork",
            "description": "Test Description",
            "original_price": 500,
            "original_status": "available",
            "collection_id": 1,
            "has_prints": True,
            "orientation": "Square",
        }
        resp = await authenticated_ac.post("/artworks", json=payload)
        assert resp.status_code == 200
        assert resp.json()["status"] == "OK"
        assert resp.json()["data"]["title"] == "Test Artwork"

    async def test_create_artwork_unauthorized(self):
        """POST /artworks should return 401 if unauthenticated."""
        from httpx import ASGITransport, AsyncClient

        from src.main import app

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            payload = {
                "title": "Fail",
                "description": "Fail",
                "original_price": 1,
                "original_status": "available",
                "collection_id": 1,
                "orientation": "Square",
            }
            resp = await ac.post("/artworks", json=payload)
            assert resp.status_code == 401

    async def test_delete_artwork_admin(self, authenticated_ac: AsyncClient):
        """DELETE /artworks/{id} deletes the artwork."""
        # First create one to delete
        payload = {
            "title": "To Delete",
            "description": "...",
            "original_price": 100,
            "original_status": "available",
            "collection_id": 1,
            "orientation": "Square",
        }
        create_resp = await authenticated_ac.post("/artworks", json=payload)
        artwork_id = create_resp.json()["data"]["id"]

        # Delete it
        delete_resp = await authenticated_ac.delete(f"/artworks/{artwork_id}")
        assert delete_resp.status_code == 200

        # Verify it's gone
        get_resp = await authenticated_ac.get(f"/artworks/{artwork_id}")
        assert get_resp.status_code == 404
