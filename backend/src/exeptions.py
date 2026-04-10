"""
Custom exception hierarchy for the ArtShop application.
Provides specialized error classes for database, authentication,
business logic, and rate limiting scenarios.
"""


class ArtShopExeption(Exception):
    """
    Root exception for all application-specific errors.
    Standardizes 'detail' messages and HTTP status codes for API responses.
    """

    detail = "An unexpected error occurred"
    status_code = 500

    def __init__(self, detail: str | None = None, status_code: int | None = None):
        """
        Initializes the exception with optional custom messaging and status overrides.
        """
        if detail:
            self.detail = detail
        if status_code:
            self.status_code = status_code
        super().__init__(self.detail)


class ObjectNotFoundException(ArtShopExeption):
    """
    Raised when a requested resource (e.g., Artwork, User) is not found in the database.
    """

    detail = "Requested object not found"
    status_code = 404


class ArtworkDisplayOnlyException(ArtShopExeption):
    """
    Raised when a user attempts to purchase an artwork marked as non-sellable.
    """

    detail = "This artwork is for display purposes only"
    status_code = 409


class OriginalSoldOutException(ArtShopExeption):
    """
    Raised when an original artwork piece has already been purchased.
    """

    detail = "The original artwork is already sold"
    status_code = 409


class PrintsSoldOutException(ArtShopExeption):
    """
    Raised when an artwork does not have any print editions available.
    """

    detail = "All prints for this artwork are currently unavailable"
    status_code = 409


class InvalidDataException(ArtShopExeption):
    """
    Raised when incoming request data fails validation or is logically inconsistent.
    """

    detail = "Provided data is invalid"
    status_code = 400


class ObjectAlreadyExistsException(ArtShopExeption):
    """
    Raised when a unique constraint violation occurs (e.g., duplicated slug or title).
    """

    detail = "An object with these identifiers already exists"
    status_code = 409


class DatabaseException(ArtShopExeption):
    """
    Raised when a generic internal error occurs during a database operation.
    """

    detail = "Internal database error occurred"
    status_code = 500


class TokenExpiredException(ArtShopExeption):
    """
    Raised when a JWT token's 'exp' claim is in the past.
    """

    detail = "Authentication token has expired"
    status_code = 401


class InvalidTokenException(ArtShopExeption):
    """
    Raised when a JWT token is malformed, has an invalid signature, or wrong type claim.
    """

    detail = "Authentication token is invalid"
    status_code = 401


class UserAlreadyExistsException(ArtShopExeption):
    """
    Raised during registration if the email address is already in use.
    """

    detail = "A user with this email address is already registered"
    status_code = 409


class RateLimitExceededException(ArtShopExeption):
    """
    Raised by middleware when a client exceeds their request quota (e.g., too many login attempts).
    """

    detail = "Request limit exceeded. Please try again later."
    status_code = 429


class PaymentGatewayException(ArtShopExeption):
    """
    Raised when the external payment gateway (Monobank) returns an error
    during invoice creation or status retrieval.
    """

    detail = "Payment gateway error. Please try again later."
    status_code = 502


class PaymentWebhookVerificationException(ArtShopExeption):
    """
    Raised when webhook signature verification fails.
    This is a security-critical error indicating potential request forgery.
    """

    detail = "Webhook signature verification failed"
    status_code = 403


class MonobankServiceError(Exception):
    """
    Raised when the Monobank API returns a non-success HTTP status code.
    Wraps the upstream error details for structured logging and handling.

    Note: This intentionally inherits from 'Exception' rather than 'ArtShopExeption'
    because it represents an external service transport error, not a client-facing
    application error. It is caught in the API layer and re-raised as
    'PaymentGatewayException' with a sanitized message for the end user.
    """

    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        self.detail = detail
        super().__init__(f"Monobank API error {status_code}: {detail}")
