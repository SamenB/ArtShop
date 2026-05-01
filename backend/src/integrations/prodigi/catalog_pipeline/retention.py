from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sqlalchemy import delete, select

from src.models.prodigi_storefront import ProdigiStorefrontBakeOrm


@dataclass(frozen=True, slots=True)
class ProdigiBakeRetentionDecision:
    keep_inactive: int
    active_bake_id: int | None
    kept_inactive_bake_ids: list[int]
    deleted_bake_ids: list[int]


class ProdigiStorefrontBakeRetentionService:
    """Prunes old inactive storefront bakes after a successful rebuild."""

    def __init__(self, db: Any):
        self.db = db

    async def prune(self, *, keep_inactive: int) -> dict[str, Any]:
        keep_inactive = max(0, int(keep_inactive))
        active_bake = (
            await self.db.session.execute(
                select(ProdigiStorefrontBakeOrm)
                .where(ProdigiStorefrontBakeOrm.is_active.is_(True))
                .order_by(ProdigiStorefrontBakeOrm.created_at.desc(), ProdigiStorefrontBakeOrm.id.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        inactive_bakes = list(
            (
                await self.db.session.execute(
                    select(ProdigiStorefrontBakeOrm)
                    .where(ProdigiStorefrontBakeOrm.is_active.is_(False))
                    .order_by(
                        ProdigiStorefrontBakeOrm.created_at.desc(),
                        ProdigiStorefrontBakeOrm.id.desc(),
                    )
                )
            )
            .scalars()
            .all()
        )

        decision = self.decide(
            active_bake_id=active_bake.id if active_bake else None,
            inactive_bake_ids=[item.id for item in inactive_bakes],
            keep_inactive=keep_inactive,
        )
        if decision.deleted_bake_ids:
            await self.db.session.execute(
                delete(ProdigiStorefrontBakeOrm).where(
                    ProdigiStorefrontBakeOrm.id.in_(decision.deleted_bake_ids)
                )
            )
            await self.db.commit()

        return {
            "keep_inactive": decision.keep_inactive,
            "active_bake_id": decision.active_bake_id,
            "kept_inactive_bake_ids": decision.kept_inactive_bake_ids,
            "deleted_bake_ids": decision.deleted_bake_ids,
            "deleted_count": len(decision.deleted_bake_ids),
        }

    @staticmethod
    def decide(
        *,
        active_bake_id: int | None,
        inactive_bake_ids: list[int],
        keep_inactive: int,
    ) -> ProdigiBakeRetentionDecision:
        keep_inactive = max(0, int(keep_inactive))
        kept = list(inactive_bake_ids[:keep_inactive])
        deleted = list(inactive_bake_ids[keep_inactive:])
        return ProdigiBakeRetentionDecision(
            keep_inactive=keep_inactive,
            active_bake_id=active_bake_id,
            kept_inactive_bake_ids=kept,
            deleted_bake_ids=deleted,
        )
