from src.services.auth import AuthService


def test_encode_decode_access_token():
    data = {"username": "testuser", "password": "testpass"}

    jwt_token = AuthService().create_access_token(data)
    assert jwt_token
    assert isinstance(jwt_token, str)

    decoded_data = AuthService().decode_access_token(jwt_token)
    assert decoded_data
    assert isinstance(decoded_data, dict)
    assert decoded_data["username"] == data["username"]
