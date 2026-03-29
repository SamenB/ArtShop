from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.database import Base

if TYPE_CHECKING:
    from src.models.artworks import ArtworksOrm


class UsersOrm(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    username: Mapped[str] = mapped_column(String(100))
    hashed_password: Mapped[str] = mapped_column(String(200))
    email: Mapped[str] = mapped_column(String(200), unique=True)

    liked_artworks: Mapped[list["ArtworksOrm"]] = relationship(
        secondary="user_likes", back_populates="liked_by_users"
    )

    def __str__(self):
        return self.username
