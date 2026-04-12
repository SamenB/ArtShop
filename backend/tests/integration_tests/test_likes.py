from httpx import AsyncClient


class TestUserLikes:
    """Integration tests for user artwork likes."""

    async def test_likes_unauthenticated(self):
        """Endpoints should return 401 if unauthenticated."""
        from httpx import ASGITransport, AsyncClient

        from src.main import app

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            # GET /users/me/likes
            resp = await ac.get("/users/me/likes")
            assert resp.status_code == 401

            # POST /users/me/likes/1
            resp = await ac.post("/users/me/likes/1")
            assert resp.status_code == 401

            # DELETE /users/me/likes/1
            resp = await ac.delete("/users/me/likes/1")
            assert resp.status_code == 401

    async def test_add_like_success(self, authenticated_ac: AsyncClient):
        """Authenticated user can like an artwork."""
        # Use artwork ID 1 from mock data
        resp = await authenticated_ac.post("/users/me/likes/1")
        assert resp.status_code == 200
        assert resp.json() == {"status": "OK"}

        # Verify it appears in the list
        resp = await authenticated_ac.get("/users/me/likes")
        assert resp.status_code == 200
        likes = resp.json()
        assert any(item["id"] == 1 for item in likes)

    async def test_add_like_duplicate(self, authenticated_ac: AsyncClient):
        """Liking an already liked artwork should be idempotent."""
        # Like once
        await authenticated_ac.post("/users/me/likes/2")
        # Like again
        resp = await authenticated_ac.post("/users/me/likes/2")
        assert resp.status_code == 200
        assert resp.json() == {"status": "OK"}

    async def test_remove_like_success(self, authenticated_ac: AsyncClient):
        """Authenticated user can unlike an artwork."""
        # Ensure it's liked first
        await authenticated_ac.post("/users/me/likes/3")

        # Remove like
        resp = await authenticated_ac.delete("/users/me/likes/3")
        assert resp.status_code == 200
        assert resp.json() == {"status": "OK"}

        # Verify it's gone from the list
        resp = await authenticated_ac.get("/users/me/likes")
        assert resp.status_code == 200
        likes = resp.json()
        assert not any(item["id"] == 3 for item in likes)

    async def test_add_like_nonexistent(self, authenticated_ac: AsyncClient):
        """Liking a nonexistent artwork should return 404."""
        resp = await authenticated_ac.post("/users/me/likes/9999")
        assert resp.status_code == 404
