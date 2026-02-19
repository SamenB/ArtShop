async def test_auth_flow(ac):
    """End-to-end: register → login → get me → logout → get me (fail)."""

    # 1. Register
    response = await ac.post(
        "/auth/register",
        json={
            "email": "e2e_test@example.com",
            "password": "strongpass123",
            "username": "e2e_user",
        },
    )
    assert response.status_code == 200
    assert response.json()["status"] == "OK"

    # 2. Register duplicate — should fail
    response = await ac.post(
        "/auth/register",
        json={
            "email": "e2e_test@example.com",
            "password": "strongpass123",
            "username": "e2e_user",
        },
    )
    assert response.status_code == 409

    # 3. Login with wrong password
    response = await ac.post(
        "/auth/login",
        json={
            "email": "e2e_test@example.com",
            "password": "wrongpassword",
        },
    )
    assert response.status_code == 401

    # 4. Login with correct password
    response = await ac.post(
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
    response = await ac.get("/auth/me")
    assert response.status_code == 200
    user = response.json()["data"]
    assert user["email"] == "e2e_test@example.com"
    assert user["username"] == "e2e_user"

    # 6. Logout
    response = await ac.post("/auth/logout")
    assert response.status_code == 200

    # 7. Get current user after logout — should fail
    response = await ac.get("/auth/me")
    assert response.status_code == 401
