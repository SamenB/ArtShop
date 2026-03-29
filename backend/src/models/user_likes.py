from __future__ import annotations

from sqlalchemy import BigInteger, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from src.database import Base


class UserLikesOrm(Base):
    __tablename__ = "user_likes"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    artwork_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("artworks.id"))
