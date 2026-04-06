from src.services.auth import AuthService


def test_create_tokens():
    tokens = AuthService().create_token_pair(user_id=1, username="testuser")
    assert tokens
    assert isinstance(tokens, tuple)
    access_token, refresh_token = tokens

    assert access_token
    assert refresh_token

    # decode to check type
    access_data = AuthService().decode_access_token(access_token)
    assert access_data["type"] == "access"

    refresh_data = AuthService().decode_refresh_token(refresh_token)
    assert refresh_data["type"] == "refresh"
