"""
API endpoints for user-specific data and interactions.
Currently handles artwork "likes" (favorites) for the authenticated user.
"""
from fastapi import APIRouter
from sqlalchemy import delete, insert, select

from src.api.dependencies import DBDep, UserDep
from src.models.artworks import ArtworksOrm
from src.models.user_likes import UserLikesOrm

router = APIRouter(prefix="/users/me", tags=["Users"])


@router.get("/likes")
async def get_my_likes(user_id: UserDep, db: DBDep):
    """
    Retrieves all artworks liked by the currently authenticated user.
    """
    query = (
        select(ArtworksOrm)
        .join(UserLikesOrm)
        .filter(UserLikesOrm.user_id == user_id)
    )
    result = await db.session.execute(query)
    artworks = result.scalars().all()
    return artworks


@router.post("/likes/{artwork_id}")
async def add_like(artwork_id: int, user_id: UserDep, db: DBDep):
    """
    Adds an artwork to the user's liked list.
    Verifies artwork existence and prevents duplicate likes.
    """
    # Check if artwork exists
    await db.artworks.get_one(id=artwork_id)

    # Check if already liked
    query = select(UserLikesOrm).filter_by(user_id=user_id, artwork_id=artwork_id)
    res = await db.session.execute(query)
    if res.scalar_one_or_none():
        return {"status": "OK"}  # Already liked

    add_stmt = insert(UserLikesOrm).values(user_id=user_id, artwork_id=artwork_id)
    await db.session.execute(add_stmt)
    await db.commit()
    return {"status": "OK"}


@router.delete("/likes/{artwork_id}")
async def remove_like(artwork_id: int, user_id: UserDep, db: DBDep):
    """
    Removes an artwork from the user's liked list.
    """
    delete_stmt = delete(UserLikesOrm).filter_by(user_id=user_id, artwork_id=artwork_id)
    await db.session.execute(delete_stmt)
    await db.commit()
    return {"status": "OK"}
