from sqlalchemy.orm import Mapped, mapped_column
from src.database import Base
from sqlalchemy import String, BigInteger, JSON


class CollectionsOrm(Base):
    __tablename__ = "collections"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    title: Mapped[str] = mapped_column(String(100))
    location: Mapped[str] = mapped_column(String(1000000))
    images: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)

    def __str__(self):
        return self.title

