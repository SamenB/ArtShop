"""
Base service class providing shared dependencies for all business logic services.
"""
from src.utils.db_manager import DBManager


class BaseService:
    """
    Abstract base class for services.
    Maintains a reference to the DBManager for database operations.
    """
    db: DBManager

    def __init__(self, db: DBManager) -> None:
        """
        Initializes the service with a database manager instance.
        """
        self.db = db
