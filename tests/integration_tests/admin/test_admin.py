from src.config import settings

async def test_admin_auth_flow(ac):
    """
    Test Admin Panel Authentication Flow:
    1. Register admin user
    2. Try login (fail - not in allowed list)
    3. Add to allowed list
    4. Login (success)
    5. Register regular user
    6. Try login as regular user (fail)
    """

    admin_email = "super_admin@artvault.com"
    admin_password = "admin_password_123"

    # 1. Register future admin user
    response = await ac.post("/auth/register", json={
        "email": admin_email,
        "password": admin_password,
        "username": "super_admin"
    })
    assert response.status_code == 200

    # 2. Try login BEFORE adding to allowed list (Should Fail)
    # Admin login expects form data, not JSON
    response = await ac.post(
        "/admin/login",
        data={"username": admin_email, "password": admin_password},
        follow_redirects=False # We want to see the 400 or redirect
    )
    # Usually sqladmin returns 400 on failed login
    assert response.status_code == 400

    # 3. Add to allowed list
    original_admins = settings.ADMIN_EMAILS.copy()
    settings.ADMIN_EMAILS.append(admin_email)

    try:
        # 4. Login (Success)
        response = await ac.post(
            "/admin/login",
            data={"username": admin_email, "password": admin_password},
            follow_redirects=False
        )
        # Success login redirects (302) to admin index
        assert response.status_code == 302
        assert "session" in response.cookies 

    finally:
        # Cleanup
        settings.ADMIN_EMAILS = original_admins


async def test_regular_user_cannot_access_admin(ac):
    regular_email = "regular_guy@example.com"
    regular_password = "password123"

    # 1. Register regular user
    await ac.post("/auth/register", json={
        "email": regular_email,
        "password": regular_password,
        "username": "regular_guy"
    })

    # 2. Try to login to admin
    response = await ac.post(
        "/admin/login",
        data={"username": regular_email, "password": regular_password},
        follow_redirects=False
    )
    assert response.status_code == 400
