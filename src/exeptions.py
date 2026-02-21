class ArtVaultExeption(Exception):
    detail = "Unexpected error"
    status_code = 500

    def __init__(self, detail: str | None = None, status_code: int | None = None):
        if detail:
            self.detail = detail
        if status_code:
            self.status_code = status_code
        super().__init__(self.detail)


class ObjectNotFoundException(ArtVaultExeption):
    detail = "Object not found"
    status_code = 404


class AllArtworksSoldOutException(ArtVaultExeption):
    detail = "All artworks are sold out"
    status_code = 409


class InvalidDataException(ArtVaultExeption):
    detail = "Invalid data"
    status_code = 400


class ObjectAlreadyExistsException(ArtVaultExeption):
    detail = "Object already exists"
    status_code = 409


class DatabaseException(ArtVaultExeption):
    detail = "Database error occurred"
    status_code = 500


class TokenExpiredException(ArtVaultExeption):
    detail = "Token expired"
    status_code = 401


class InvalidTokenException(ArtVaultExeption):
    detail = "Invalid token"
    status_code = 401
