class ArtVaultExeption(Exception):
    detail = "Unexpected error"

    def __init__(self, *args, **kwargs):
        super().__init__(self.detail, **kwargs)


class ObjectNotFoundException(ArtVaultExeption):
    detail = "Object not found"


class AllArtworksSoldOutException(ArtVaultExeption):
    detail = "All artworks are sold out"


class InvalidDataException(ArtVaultExeption):
    detail = "Invalid data"


class ObjectAlreadyExistsException(ArtVaultExeption):
    detail = "Object already exists"

class DatabaseException(ArtVaultExeption):
    detail = "Database error occurred"

class TokenExpiredException(ArtVaultExeption):
    detail = "Token expired"

class InvalidTokenException(ArtVaultExeption):
    detail = "Invalid token"

