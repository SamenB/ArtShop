"""
Database session and repository management utility.
Implements the Unit of Work pattern to coordinate multiple repositories within a single
atomic transaction. Includes specialized handling for database deadlocks.
"""

import asyncio

from sqlalchemy.exc import OperationalError

from src.repositories.artworks import ArtworksRepository
from src.repositories.labels import (
    ArtworkLabelsRepository,
    LabelCategoriesRepository,
    LabelsRepository,
)
from src.repositories.orders import OrderItemsRepository, OrdersRepository
from src.repositories.users import UsersRepository


class DBManager:
    """
    Manages the lifecycle of a database session and initializes all repositories.
    Designed for use as an asynchronous context manager.
    """

    def __init__(self, session_factory):
        """
        Initializes the manager with a session factory (e.g., async_sessionmaker).
        """
        self.session_factory = session_factory

    async def __aenter__(self):
        """
        Opens a new database session and initializes domain repositories.
        """
        self.session = self.session_factory()

        self.artworks = ArtworksRepository(self.session)
        self.users = UsersRepository(self.session)
        self.orders = OrdersRepository(self.session)
        self.order_items = OrderItemsRepository(self.session)
        self.labels = LabelsRepository(self.session)
        self.artwork_labels = ArtworkLabelsRepository(self.session)
        self.label_categories = LabelCategoriesRepository(self.session)
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """
        Handles session closure and automatic rollback on unhandled exceptions.
        """
        if exc_type:
            # Atomic rollback if an error occurred during the context block.
            await self.session.rollback()
        await self.session.close()

    async def commit(self):
        """
        Commits the current transaction to the database.

        Includes a retry mechanism for 'deadlock' operational errors.
        Attempts to re-commit up to 3 times with exponential backoff before raising.
        """
        for attempt in range(3):
            try:
                await self.session.commit()
                return
            except OperationalError as e:
                # Catch specific deadlock errors from the database engine.
                if "deadlock" in str(e).lower():
                    await self.session.rollback()
                    if attempt < 2:
                        # Wait briefly before retrying to allow other transactions to finish.
                        await asyncio.sleep(0.1 * (attempt + 1))
                        continue
                raise

    async def rollback(self):
        """
        Explicitly rolls back the current transaction.
        """
        await self.session.rollback()
