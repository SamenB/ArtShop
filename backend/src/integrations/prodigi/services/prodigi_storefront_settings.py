from __future__ import annotations

from copy import deepcopy
from typing import Any

from sqlalchemy import func, select

from src.integrations.prodigi.services.prodigi_business_policy import (
    ProdigiBusinessPolicyService,
)
from src.integrations.prodigi.services.prodigi_storefront_policy import STOREFRONT_POLICY
from src.models.prodigi_storefront import (
    ProdigiArtworkStorefrontPayloadOrm,
    ProdigiStorefrontBakeOrm,
    ProdigiStorefrontSettingsOrm,
)

ALLOWED_SHIPPING_TIERS = {"budget", "express", "overnight", "standard", "standardplus"}
ALLOWED_FALLBACK_MODES = {"standard_then_cheapest", "cheapest", "block"}

DEFAULT_SHIPPING_POLICY: dict[str, Any] = {
    "checkout_shipping_cap": 35.0,
    "preferred_tier_order": ["overnight", "express", "standardplus", "standard", "budget"],
    "fallback_when_none_under_cap": "standard_then_cheapest",
    "fallback_tier": "standard",
}

DEFAULT_SNAPSHOT_DEFAULTS: dict[str, Any] = {
    "paper_material": "hahnemuhle_german_etching",
    "include_notice_level": True,
}


class ProdigiStorefrontSettingsService:
    """
    Single source for configurable Prodigi storefront bake/materialization policy.

    The code constants remain defaults. Runtime services consume this service so
    admin edits affect catalog preview, snapshot bake, materialized payloads, and
    checkout read models through one validated config shape.
    """

    def __init__(self, db):
        self.db = db

    async def get_effective_config(self) -> dict[str, Any]:
        row = await self._get_or_create()
        return self._build_effective_config(row)

    async def get_payload_policy_version(self) -> str:
        config = await self.get_effective_config()
        return str(config["payload_policy_version"])

    async def save_config(self, data: dict[str, Any]) -> dict[str, Any]:
        row = await self._get_or_create()
        current = self._build_effective_config(row)
        next_config = {
            "shipping_policy": data.get("shipping_policy", current["shipping_policy"]),
            "category_policy": data.get("category_policy", current["category_policy"]),
            "snapshot_defaults": data.get("snapshot_defaults", current["snapshot_defaults"]),
            "payload_policy_version": data.get(
                "payload_policy_version", current["payload_policy_version"]
            ),
        }
        validated = self.validate_config(next_config)
        row.shipping_policy = validated["shipping_policy"]
        row.category_policy = validated["category_policy"]
        row.snapshot_defaults = validated["snapshot_defaults"]
        row.payload_policy_version = validated["payload_policy_version"]
        await self.db.commit()
        await self.db.session.refresh(row)
        return self._build_effective_config(row)

    async def build_admin_payload(self) -> dict[str, Any]:
        row = await self._get_or_create()
        effective = self._build_effective_config(row)
        return {
            "defaults": self.default_config(),
            "settings": {
                "id": row.id,
                "shipping_policy": row.shipping_policy or {},
                "category_policy": row.category_policy or {},
                "snapshot_defaults": row.snapshot_defaults or {},
                "payload_policy_version": row.payload_policy_version,
                "updated_at": row.updated_at.isoformat() if row.updated_at else None,
            },
            "effective": effective,
            "status": await self._build_status(),
        }

    async def _build_status(self) -> dict[str, Any]:
        active_bake = (
            await self.db.session.execute(
                select(ProdigiStorefrontBakeOrm)
                .where(ProdigiStorefrontBakeOrm.is_active.is_(True))
                .order_by(
                    ProdigiStorefrontBakeOrm.created_at.desc(),
                    ProdigiStorefrontBakeOrm.id.desc(),
                )
                .limit(1)
            )
        ).scalar_one_or_none()
        payload_count = 0
        if active_bake is not None:
            payload_count = int(
                await self.db.session.scalar(
                    select(func.count(ProdigiArtworkStorefrontPayloadOrm.id)).where(
                        ProdigiArtworkStorefrontPayloadOrm.bake_id == active_bake.id
                    )
                )
                or 0
            )
        return {
            "active_bake": (
                {
                    "id": active_bake.id,
                    "bake_key": active_bake.bake_key,
                    "paper_material": active_bake.paper_material,
                    "include_notice_level": active_bake.include_notice_level,
                    "ratio_count": active_bake.ratio_count,
                    "country_count": active_bake.country_count,
                    "offer_group_count": active_bake.offer_group_count,
                    "offer_size_count": active_bake.offer_size_count,
                }
                if active_bake is not None
                else None
            ),
            "materialized_payload_count": payload_count,
        }

    async def _get_or_create(self) -> ProdigiStorefrontSettingsOrm:
        row = await self.db.session.get(ProdigiStorefrontSettingsOrm, 1)
        if row is not None:
            return row
        defaults = self.default_config()
        row = ProdigiStorefrontSettingsOrm(
            id=1,
            shipping_policy=defaults["shipping_policy"],
            category_policy=defaults["category_policy"],
            snapshot_defaults=defaults["snapshot_defaults"],
            payload_policy_version=defaults["payload_policy_version"],
        )
        self.db.session.add(row)
        await self.db.commit()
        await self.db.session.refresh(row)
        return row

    @classmethod
    def default_config(cls) -> dict[str, Any]:
        return {
            "shipping_policy": deepcopy(DEFAULT_SHIPPING_POLICY),
            "category_policy": deepcopy(STOREFRONT_POLICY),
            "snapshot_defaults": deepcopy(DEFAULT_SNAPSHOT_DEFAULTS),
            "payload_policy_version": ProdigiBusinessPolicyService.POLICY_VERSION,
        }

    @classmethod
    def validate_config(cls, config: dict[str, Any]) -> dict[str, Any]:
        shipping_policy = cls._validate_shipping_policy(config.get("shipping_policy") or {})
        category_policy = cls._validate_category_policy(config.get("category_policy") or {})
        snapshot_defaults = cls._validate_snapshot_defaults(config.get("snapshot_defaults") or {})
        payload_policy_version = str(config.get("payload_policy_version") or "").strip()
        if not payload_policy_version:
            raise ValueError("payload_policy_version is required.")
        return {
            "shipping_policy": shipping_policy,
            "category_policy": category_policy,
            "snapshot_defaults": snapshot_defaults,
            "payload_policy_version": payload_policy_version,
        }

    @classmethod
    def _validate_shipping_policy(cls, value: dict[str, Any]) -> dict[str, Any]:
        policy = {**deepcopy(DEFAULT_SHIPPING_POLICY), **dict(value)}
        try:
            cap = float(policy["checkout_shipping_cap"])
        except (TypeError, ValueError) as exc:
            raise ValueError("checkout_shipping_cap must be a number.") from exc
        if cap < 0:
            raise ValueError("checkout_shipping_cap must be greater than or equal to 0.")

        preferred = [str(item).strip().lower() for item in policy["preferred_tier_order"] or []]
        if not preferred:
            raise ValueError("preferred_tier_order must contain at least one tier.")
        unknown = sorted(set(preferred) - ALLOWED_SHIPPING_TIERS)
        if unknown:
            raise ValueError(f"Unknown preferred shipping tier(s): {', '.join(unknown)}.")

        fallback_mode = str(policy["fallback_when_none_under_cap"]).strip()
        if fallback_mode not in ALLOWED_FALLBACK_MODES:
            raise ValueError("fallback_when_none_under_cap is invalid.")
        fallback_tier = str(policy["fallback_tier"]).strip().lower()
        if fallback_tier not in ALLOWED_SHIPPING_TIERS:
            raise ValueError("fallback_tier is invalid.")

        return {
            "checkout_shipping_cap": cap,
            "preferred_tier_order": preferred,
            "fallback_when_none_under_cap": fallback_mode,
            "fallback_tier": fallback_tier,
        }

    @classmethod
    def _validate_category_policy(cls, value: dict[str, Any]) -> dict[str, Any]:
        defaults = deepcopy(STOREFRONT_POLICY)
        provided = dict(value)
        unknown_categories = sorted(set(provided) - set(defaults))
        if unknown_categories:
            raise ValueError(f"Unknown category id(s): {', '.join(unknown_categories)}.")

        merged = defaults
        for category_id, override in provided.items():
            if not isinstance(override, dict):
                raise ValueError(f"Category policy for {category_id} must be an object.")
            policy = deepcopy(merged[category_id])
            policy.update(override)
            policy["shipping"] = {
                **dict(merged[category_id].get("shipping") or {}),
                **dict(override.get("shipping") or {}),
            }
            for field_name in ("fixed_attributes", "recommended_defaults", "allowed_attributes"):
                if not isinstance(policy.get(field_name), dict):
                    raise ValueError(f"{category_id}.{field_name} must be an object.")
            shipping = policy.get("shipping") or {}
            if not isinstance(shipping, dict):
                raise ValueError(f"{category_id}.shipping must be an object.")
            for list_field in ("visible_methods", "preferred_order"):
                if not isinstance(shipping.get(list_field, []), list):
                    raise ValueError(f"{category_id}.shipping.{list_field} must be a list.")
            if not isinstance(policy.get("notes", []), list):
                raise ValueError(f"{category_id}.notes must be a list.")
            merged[category_id] = policy
        return merged

    @classmethod
    def _validate_snapshot_defaults(cls, value: dict[str, Any]) -> dict[str, Any]:
        defaults = {**deepcopy(DEFAULT_SNAPSHOT_DEFAULTS), **dict(value)}
        paper_material = str(defaults.get("paper_material") or "").strip()
        if not paper_material:
            raise ValueError("snapshot_defaults.paper_material is required.")
        return {
            "paper_material": paper_material,
            "include_notice_level": bool(defaults.get("include_notice_level")),
        }

    @classmethod
    def _build_effective_config(cls, row: ProdigiStorefrontSettingsOrm) -> dict[str, Any]:
        return cls.validate_config(
            {
                "shipping_policy": row.shipping_policy or {},
                "category_policy": row.category_policy or {},
                "snapshot_defaults": row.snapshot_defaults or {},
                "payload_policy_version": row.payload_policy_version
                or ProdigiBusinessPolicyService.POLICY_VERSION,
            }
        )
