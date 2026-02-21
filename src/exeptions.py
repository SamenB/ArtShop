class ArtShopExeption(Exception):
    detail = "Unexpected error"
    status_code = 500

    def __init__(self, detail: str | None = None, status_code: int | None = None):
        if detail:
            self.detail = detail
        if status_code:
            self.status_code = status_code
        super().__init__(self.detail)


class ObjectNotFoundException(ArtShopExeption):
    detail = "Object not found"
    status_code = 404


class ArtworkDisplayOnlyException(ArtShopExeption):
    detail = "This artwork is for display only"
    status_code = 409


class OriginalSoldOutException(ArtShopExeption):
    detail = "The original artwork is already sold"
    status_code = 409


class PrintsSoldOutException(ArtShopExeption):
    detail = "All prints for this artwork are sold out"
    status_code = 409


class InvalidDataException(ArtShopExeption):
    detail = "Invalid data"
    status_code = 400


class ObjectAlreadyExistsException(ArtShopExeption):
    detail = "Object already exists"
    status_code = 409


class DatabaseException(ArtShopExeption):
    detail = "Database error occurred"
    status_code = 500


class TokenExpiredException(ArtShopExeption):
    detail = "Token expired"
    status_code = 401


class InvalidTokenException(ArtShopExeption):
    detail = "Invalid token"
    status_code = 401
