from httpx import ASGITransport, AsyncClient

from src.main import app


async def test_auth_flow():
    """End-to-end: register → login → get me → logout → get me (fail).
    Uses its own isolated client to avoid clearing cookies on the shared session client.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Register
        response = await client.post(
            "/auth/register",
            json={
                "email": "e2e_test@example.com",
                "password": "strongpass123",
                "username": "e2e_user",
            },
        )
        assert response.status_code == 201
        assert response.json()["status"] == "OK"

        # 2. Register duplicate — should fail
        response = await client.post(
            "/auth/register",
            json={
                "email": "e2e_test@example.com",
                "password": "strongpass123",
                "username": "e2e_user",
            },
        )
        assert response.status_code == 409

        # 3. Login with wrong password
        response = await client.post(
            "/auth/login",
            json={
                "email": "e2e_test@example.com",
                "password": "wrongpassword",
            },
        )
        assert response.status_code == 401

        # 4. Login with correct password
        response = await client.post(
            "/auth/login",
            json={
                "email": "e2e_test@example.com",
                "password": "strongpass123",
            },
        )
        assert response.status_code == 200
        assert "access_token" in response.json()
        assert "access_token" in response.cookies

        # 5. Get current user (authenticated)
        response = await client.get("/auth/me")
        assert response.status_code == 200
        user = response.json()
        assert user["email"] == "e2e_test@example.com"
        assert user["username"] == "e2e_user"

        # 6. Test Refresh Token Rotation
        # 6a. Attempt refresh without cookies (should fail)
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as no_cookie_client:
            req_no_cookie = await no_cookie_client.post("/auth/refresh")
            assert req_no_cookie.status_code == 401

        # 6b. Attempt refresh with cookies
        response = await client.post("/auth/refresh")
        assert response.status_code == 200
        assert "access_token" in response.cookies
        assert "refresh_token" in response.cookies

        # 6c. Verify still authenticated
        response = await client.get("/auth/me")
        assert response.status_code == 200

        # 7. Logout
        response = await client.post("/auth/logout")
        assert response.status_code == 200

        # 8. Get current user after logout — should fail (assuming access token cleared)
        response = await client.get("/auth/me")
        assert response.status_code == 401

        # 9. Try refresh after logout (refresh token should be absent or deleted)
        response = await client.post("/auth/refresh")
        assert response.status_code == 401


async def test_auth_rate_limiting():
    """Test login endpoint limits (10 reqs / min)."""
    from httpx import ASGITransport, AsyncClient

    from src.main import app

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Send 12 rapid requests to login
        responses = []
        for _ in range(12):
            resp = await client.post(
                "/auth/login",
                json={"email": "someone@example.com", "password": "wrongpassword"},
            )
            responses.append(resp.status_code)

        # At least one of the last requests should be 429
        assert 429 in responses
