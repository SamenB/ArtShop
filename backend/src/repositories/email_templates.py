"""
Repository for email template data access.
"""

from sqlalchemy import select

from src.models.email_templates import EmailTemplateOrm
from src.repositories.base import BaseRepository
from src.repositories.mappers.mappers import EmailTemplateMapper
from src.schemas.email_templates import EmailTemplate


class EmailTemplatesRepository(BaseRepository):
    """
    Provides data access for EmailTemplateOrm records.
    Extends BaseRepository with a key-based lookup method used by the email service.
    """

    model = EmailTemplateOrm
    schema = EmailTemplate
    mapper = EmailTemplateMapper

    async def get_by_key(self, key: str) -> EmailTemplateOrm | None:
        """
        Retrieves a single email template by its unique key.
        Returns the ORM instance directly (not schema) so callers can
        read the raw fields without an extra DB round-trip.
        """
        result = await self.session.execute(
            select(self.model).where(self.model.key == key)
        )
        return result.scalars().one_or_none()
