from src.utils.db_manager import DBManager


class BaseService:
    db: DBManager

    def __init__(self, db: DBManager) -> None:
        self.db = db
