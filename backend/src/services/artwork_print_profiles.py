from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from PIL import Image
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from src.models.artworks import ArtworksOrm
from src.repositories.prodigi_storefront import ProdigiStorefrontRepository
from src.services.prodigi_storefront_policy import STOREFRONT_POLICY

CANVAS_WRAP_OPTIONS = ("White", "Black", "ImageWrap", "MirrorWrap")
WRAPPED_CANVAS_CATEGORIES = (
    "canvasStretched",
    "canvasClassicFrame",
    "canvasFloatingFrame",
)


def extract_canvas_wrap_selection(overrides: dict[str, Any] | None) -> str | None:
    if not isinstance(overrides, dict):
        return None
    for category_id in WRAPPED_CANVAS_CATEGORIES:
        category_override = overrides.get(category_id)
        if not isinstance(category_override, dict):
            continue
        recommended_defaults = category_override.get("recommended_defaults")
        if not isinstance(recommended_defaults, dict):
            continue
        wrap = recommended_defaults.get("wrap")
        if wrap in CANVAS_WRAP_OPTIONS:
            return str(wrap)
    return None


def apply_canvas_wrap_selection(
    overrides: dict[str, Any] | None,
    wrap: str | None,
) -> dict[str, Any] | None:
    if wrap is not None and wrap not in CANVAS_WRAP_OPTIONS:
        raise ValueError(f"Unsupported canvas wrap: {wrap}")

    next_overrides: dict[str, Any] = dict(overrides or {})
    for category_id in WRAPPED_CANVAS_CATEGORIES:
        category_payload = dict(next_overrides.get(category_id) or {})
        recommended_defaults = dict(category_payload.get("recommended_defaults") or {})
        if wrap:
            recommended_defaults["wrap"] = wrap
            category_payload["recommended_defaults"] = recommended_defaults
            next_overrides[category_id] = category_payload
            continue

        recommended_defaults.pop("wrap", None)
        if recommended_defaults:
            category_payload["recommended_defaults"] = recommended_defaults
        else:
            category_payload.pop("recommended_defaults", None)
        if category_payload:
            next_overrides[category_id] = category_payload
        else:
            next_overrides.pop(category_id, None)

    return next_overrides or None


def resolve_profile_attribute_config(
    *,
    fixed_attributes: dict[str, Any] | None,
    recommended_defaults: dict[str, Any] | None,
    allowed_attributes: dict[str, list[Any]] | None,
    effective_profile: dict[str, Any] | None,
) -> tuple[dict[str, Any], dict[str, Any], dict[str, list[Any]]]:
    resolved_fixed = dict(fixed_attributes or {})
    resolved_defaults = dict(recommended_defaults or {})
    resolved_allowed = {
        key: list(values)
        for key, values in (allowed_attributes or {}).items()
    }
    if not isinstance(effective_profile, dict):
        return resolved_fixed, resolved_defaults, resolved_allowed

    profile_fixed = effective_profile.get("fixed_attributes")
    if isinstance(profile_fixed, dict):
        resolved_fixed.update(profile_fixed)

    profile_defaults = effective_profile.get("recommended_defaults")
    if isinstance(profile_defaults, dict):
        resolved_defaults.update(profile_defaults)

    profile_allowed = effective_profile.get("allowed_attributes")
    if isinstance(profile_allowed, dict):
        resolved_allowed = {
            key: list(values) if isinstance(values, list) else [values]
            for key, values in profile_allowed.items()
        }

    return resolved_fixed, resolved_defaults, resolved_allowed

CATEGORY_PROFILE_DEFAULTS: dict[str, dict[str, Any]] = {
    "paperPrintRolled": {
        "prodigi_sizing": "fillPrintArea",
        "editor_mode": "front_only",
        "crop_strategy": "cover",
        "safe_margin_pct": 2.0,
        "mount_safe_margin_pct": 0.0,
        "wrap_margin_pct": 0.0,
        "edge_extension_mode": "none",
        "background_fill": "none",
        "notes": [
            "Use full-front composition with a conservative safe margin for trimming tolerance.",
            "Prefer manual review for near-edge signatures or fine border details.",
        ],
    },
    "paperPrintBoxFramed": {
        "prodigi_sizing": "fillPrintArea",
        "editor_mode": "front_only",
        "crop_strategy": "cover",
        "safe_margin_pct": 3.0,
        "mount_safe_margin_pct": 0.0,
        "wrap_margin_pct": 0.0,
        "edge_extension_mode": "none",
        "background_fill": "none",
        "notes": [
            "Keep critical composition slightly farther from the edges for framed presentation.",
            "No-mount framed paper is rendered to the exact visible print target.",
        ],
    },
    "paperPrintBoxFramedMounted": {
        "prodigi_sizing": "fillPrintArea",
        "editor_mode": "front_only_mount",
        "crop_strategy": "cover",
        "safe_margin_pct": 3.0,
        "mount_safe_margin_pct": 6.0,
        "wrap_margin_pct": 0.0,
        "edge_extension_mode": "none",
        "background_fill": "none",
        "notes": [
            "Mounted framed paper is rendered to Prodigi's image-window print target, not the outer frame size.",
            "Keep signatures and fine border detail inside the mount safe margin.",
        ],
    },
    "paperPrintClassicFramed": {
        "prodigi_sizing": "fillPrintArea",
        "editor_mode": "front_only",
        "crop_strategy": "cover",
        "safe_margin_pct": 3.0,
        "mount_safe_margin_pct": 0.0,
        "wrap_margin_pct": 0.0,
        "edge_extension_mode": "none",
        "background_fill": "none",
        "notes": [
            "Classic framed paper is rendered to the exact visible print target.",
        ],
    },
    "paperPrintClassicFramedMounted": {
        "prodigi_sizing": "fillPrintArea",
        "editor_mode": "front_only_mount",
        "crop_strategy": "cover",
        "safe_margin_pct": 3.0,
        "mount_safe_margin_pct": 6.0,
        "wrap_margin_pct": 0.0,
        "edge_extension_mode": "none",
        "background_fill": "none",
        "notes": [
            "Mounted classic framed paper is rendered to Prodigi's image-window print target.",
            "Keep signatures and fine border detail inside the mount safe margin.",
        ],
    },
    "canvasRolled": {
        "prodigi_sizing": "fillPrintArea",
        "editor_mode": "front_only",
        "crop_strategy": "cover",
        "safe_margin_pct": 2.0,
        "mount_safe_margin_pct": 0.0,
        "wrap_margin_pct": 0.0,
        "edge_extension_mode": "none",
        "background_fill": "none",
        "notes": [
            "Rolled canvas has no wrapped edge, so the artwork review stays focused on the front area.",
        ],
    },
    "canvasStretched": {
        "prodigi_sizing": "fillPrintArea",
        "editor_mode": "provider_mirror_wrap",
        "crop_strategy": "cover",
        "safe_margin_pct": 2.0,
        "mount_safe_margin_pct": 0.0,
        "wrap_margin_pct": 0.0,
        "edge_extension_mode": "prodigi_mirror",
        "background_fill": "none",
        "notes": [
            "Prodigi generates mirror wrap from the clean front image.",
            "Review edge-heavy compositions because mirrored sides can repeat signatures or hard lines.",
        ],
    },
    "canvasClassicFrame": {
        "prodigi_sizing": "fillPrintArea",
        "editor_mode": "provider_mirror_wrap",
        "crop_strategy": "cover",
        "safe_margin_pct": 3.0,
        "mount_safe_margin_pct": 0.0,
        "wrap_margin_pct": 0.0,
        "edge_extension_mode": "prodigi_mirror",
        "background_fill": "none",
        "notes": [
            "Classic frames can hide a small edge area, but the clean front image remains the production source.",
        ],
    },
    "canvasFloatingFrame": {
        "prodigi_sizing": "fillPrintArea",
        "editor_mode": "provider_mirror_wrap",
        "crop_strategy": "cover",
        "safe_margin_pct": 3.0,
        "mount_safe_margin_pct": 0.0,
        "wrap_margin_pct": 0.0,
        "edge_extension_mode": "prodigi_mirror",
        "background_fill": "none",
        "notes": [
            "Floating frames reward clean edge composition; Prodigi mirrors the sides from the front asset.",
        ],
    },
}


class ArtworkPrintProfileService:
    def __init__(self, db):
        self.db = db
        self.storefront_repository = ProdigiStorefrontRepository(db.session)

    async def get_profile_bundle(self, artwork_id: int) -> dict[str, Any]:
        artwork = await self._get_artwork_orm(artwork_id)
        bake = await self.storefront_repository.get_active_bake()

        ratio_label = artwork.print_aspect_ratio.label if artwork.print_aspect_ratio else None
        ratio_supported = False
        if bake and ratio_label:
            bake_ratios = await self.storefront_repository.get_bake_ratios(bake.id)
            ratio_supported = any(item["ratio_label"] == ratio_label for item in bake_ratios)
        return self.build_profile_bundle_for_artwork(
            artwork=artwork,
            bake=bake,
            ratio_supported=ratio_supported,
        )

    def build_profile_bundle_for_artwork(
        self,
        *,
        artwork: ArtworksOrm,
        bake: Any | None,
        ratio_supported: bool,
    ) -> dict[str, Any]:
        source_metadata = artwork.print_source_metadata or {}
        recommended_profiles = self._build_recommended_profiles(artwork)
        overrides = artwork.print_profile_overrides or {}
        effective_profiles = self._merge_overrides(recommended_profiles, overrides)

        return {
            "artwork_id": artwork.id,
            "slug": artwork.slug,
            "title": artwork.title,
            "print_aspect_ratio": {
                "id": artwork.print_aspect_ratio.id,
                "label": artwork.print_aspect_ratio.label,
                "description": artwork.print_aspect_ratio.description,
            }
            if artwork.print_aspect_ratio
            else None,
            "active_bake": {
                "id": bake.id,
                "bake_key": bake.bake_key,
                "paper_material": bake.paper_material,
                "include_notice_level": bake.include_notice_level,
                "ratio_supported": ratio_supported,
            }
            if bake
            else None,
            "print_quality_url": artwork.print_quality_url,
            "print_source_metadata": source_metadata,
            "source_quality_summary": self._build_quality_summary(source_metadata),
            "recommended_profiles": recommended_profiles,
            "print_profile_overrides": overrides,
            "effective_profiles": effective_profiles,
        }

    async def _get_artwork_orm(self, artwork_id: int) -> ArtworksOrm:
        query = (
            select(ArtworksOrm)
            .where(ArtworksOrm.id == artwork_id)
            .options(selectinload(ArtworksOrm.print_aspect_ratio))
        )
        result = await self.db.session.execute(query)
        artwork = result.scalar_one_or_none()
        if artwork is None:
            from src.exeptions import ObjectNotFoundException

            raise ObjectNotFoundException(detail="Artwork not found in artworks")
        return artwork

    def _build_recommended_profiles(self, artwork: ArtworksOrm) -> dict[str, dict[str, Any]]:
        profiles: dict[str, dict[str, Any]] = {}
        source_meta = artwork.print_source_metadata or {}
        for category_id, storefront_policy in STOREFRONT_POLICY.items():
            defaults = CATEGORY_PROFILE_DEFAULTS.get(category_id, {})
            profiles[category_id] = {
                "category_id": category_id,
                "label": storefront_policy["label"],
                "prodigi_sizing": defaults.get("prodigi_sizing", "fillPrintArea"),
                "editor_mode": defaults.get("editor_mode", "front_only"),
                "crop_strategy": defaults.get("crop_strategy", "cover"),
                "safe_margin_pct": defaults.get("safe_margin_pct", 2.0),
                "mount_safe_margin_pct": defaults.get("mount_safe_margin_pct", 0.0),
                "wrap_margin_pct": defaults.get("wrap_margin_pct", 0.0),
                "edge_extension_mode": defaults.get("edge_extension_mode", "none"),
                "background_fill": defaults.get("background_fill", "none"),
                "target_dpi": 300,
                "minimum_dpi": 150,
                "recommended_defaults": dict(storefront_policy.get("recommended_defaults") or {}),
                "fixed_attributes": dict(storefront_policy.get("fixed_attributes") or {}),
                "allowed_attributes": dict(storefront_policy.get("allowed_attributes") or {}),
                "shipping_defaults": dict(storefront_policy.get("shipping") or {}),
                "notes": list(storefront_policy.get("notes") or [])
                + list(defaults.get("notes") or []),
                "source_recommendation": self._build_source_recommendation(source_meta),
            }
        return profiles

    def _merge_overrides(
        self,
        recommended_profiles: dict[str, dict[str, Any]],
        overrides: dict[str, Any],
    ) -> dict[str, dict[str, Any]]:
        effective: dict[str, dict[str, Any]] = {}
        for category_id, base_profile in recommended_profiles.items():
            override_data = overrides.get(category_id)
            if isinstance(override_data, dict):
                effective[category_id] = {
                    **base_profile,
                    **override_data,
                    "source_recommendation": base_profile.get("source_recommendation"),
                }
            else:
                effective[category_id] = dict(base_profile)
        return effective

    def _build_source_recommendation(self, metadata: dict[str, Any]) -> dict[str, Any]:
        width_px = metadata.get("width_px")
        height_px = metadata.get("height_px")
        if not width_px or not height_px:
            return {
                "status": "missing_dimensions",
                "message": "Upload a hi-res print source to unlock exact print-size validation.",
            }

        longest_edge = max(width_px, height_px)
        shortest_edge = min(width_px, height_px)
        return {
            "status": "ready",
            "longest_edge_px": longest_edge,
            "shortest_edge_px": shortest_edge,
            "max_long_edge_in_at_300dpi": round(longest_edge / 300, 2),
            "max_short_edge_in_at_300dpi": round(shortest_edge / 300, 2),
            "max_long_edge_in_at_150dpi": round(longest_edge / 150, 2),
            "max_short_edge_in_at_150dpi": round(shortest_edge / 150, 2),
        }

    def _build_quality_summary(self, metadata: dict[str, Any]) -> dict[str, Any]:
        width_px = metadata.get("width_px")
        height_px = metadata.get("height_px")
        if not width_px or not height_px:
            return {
                "status": "missing_asset",
                "message": "No hi-res print source metadata is available yet.",
            }

        embedded_dpi_x = metadata.get("dpi_x")
        embedded_dpi_y = metadata.get("dpi_y")
        return {
            "status": "ready",
            "message": (
                "Pixel dimensions are available. Embedded DPI is informative only; "
                "print suitability should be checked against target output size."
            ),
            "embedded_dpi": {
                "x": embedded_dpi_x,
                "y": embedded_dpi_y,
            },
            "icc_profile_present": bool(metadata.get("icc_profile_present")),
            "max_print_size_at_300dpi_in": {
                "width": round(width_px / 300, 2),
                "height": round(height_px / 300, 2),
            },
            "max_print_size_at_150dpi_in": {
                "width": round(width_px / 150, 2),
                "height": round(height_px / 150, 2),
            },
        }

    @staticmethod
    def extract_source_metadata(file_path: str, public_url: str | None = None) -> dict[str, Any]:
        path = Path(file_path)
        with Image.open(path) as img:
            dpi_info = img.info.get("dpi")
            dpi_x = None
            dpi_y = None
            if isinstance(dpi_info, tuple) and len(dpi_info) >= 2:
                dpi_x = round(float(dpi_info[0]), 2)
                dpi_y = round(float(dpi_info[1]), 2)

            width_px, height_px = img.size
            icc_profile_present = bool(img.info.get("icc_profile"))

            metadata = {
                "public_url": public_url,
                "file_name": path.name,
                "file_size_bytes": os.path.getsize(path),
                "format": img.format,
                "mode": img.mode,
                "width_px": width_px,
                "height_px": height_px,
                "dpi_x": dpi_x,
                "dpi_y": dpi_y,
                "icc_profile_present": icc_profile_present,
                "aspect_ratio": ArtworkPrintProfileService._safe_ratio(width_px, height_px),
                "max_print_size_at_300dpi_in": {
                    "width": round(width_px / 300, 2),
                    "height": round(height_px / 300, 2),
                },
                "max_print_size_at_150dpi_in": {
                    "width": round(width_px / 150, 2),
                    "height": round(height_px / 150, 2),
                },
            }
            return metadata

    @staticmethod
    def _safe_ratio(width_px: int, height_px: int) -> str:
        if not width_px or not height_px:
            return "unknown"
        from math import gcd

        g = gcd(width_px, height_px)
        return f"{width_px // g}:{height_px // g}"
