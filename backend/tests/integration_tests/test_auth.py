from src.services.auth import AuthService


def test_encode_decode_tokens():
    tokens = AuthService().create_token_pair(user_id=1, username="testuser")
    assert tokens
    assert isinstance(tokens, tuple)

    access_token, refresh_token = tokens
    decoded_data = AuthService().decode_access_token(access_token)
    assert decoded_data
    assert isinstance(decoded_data, dict)
    assert decoded_data["username"] == "testuser"
    assert decoded_data["type"] == "access"
