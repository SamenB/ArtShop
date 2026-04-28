"""
Print pipeline workflow built around a single production master slot.

The admin uploads 1 file per artwork:
  master — clean edge-to-edge artwork used for all print products.

White borders for paper prints are generated programmatically at order time
using the artwork's white_border_pct setting (default 5%).
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import re
from collections import defaultdict
from copy import deepcopy
from fractions import Fraction
from pathlib import Path
from typing import Any

from PIL import Image, ImageOps
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from src.exeptions import ObjectNotFoundException
from src.integrations.prodigi.repositories.prodigi_storefront import ProdigiStorefrontRepository
from src.integrations.prodigi.services.prodigi_print_area_resolver import ProdigiPrintAreaResolver
from src.models.artworks import ArtworksOrm
from src.print_on_demand import get_print_provider
from src.services.artwork_print_profiles import (
    WRAPPED_CANVAS_CATEGORIES,
    extract_canvas_wrap_selection,
)

Image.MAX_IMAGE_PIXELS = None

SIZE_PATTERN = re.compile(r"(?P<w>\d+(?:\.\d+)?)x(?P<h>\d+(?:\.\d+)?)")
RATIO_PATTERN = re.compile(r"(?P<w>\d+(?:\.\d+)?)[x:](?P<h>\d+(?:\.\d+)?)")
TARGET_DPI = 300
CLEAN_MASTER_RATIO_PRESET_TARGETS: dict[str, tuple[int, int]] = {
    # short_edge_px, long_edge_px
    # These universal clean-master targets stay exact by ratio while covering
    # the current ArtShop paper + canvas scope from the local Prodigi CSV set.
    "1:1": (18000, 18000),
    "2:3": (17000, 25500),
    "3:4": (18000, 24000),
    "4:5": (16800, 21000),
    "5:7": (17500, 24500),
}
MASTER_SLOTS: dict[str, dict[str, Any]] = {
    "master": {
        "label": "Production Master",
        "asset_role": "master",
        "description": (
            "Clean edge-to-edge artwork used for all print products. "
            "White borders for paper prints are generated programmatically."
        ),
        "covers_categories": [
            "paperPrintRolled",
            "paperPrintBoxFramed",
            "canvasRolled",
            "canvasStretched",
            "canvasClassicFrame",
            "canvasFloatingFrame",
        ],
        "derives_categories": [],
        "wrap_margin_pct": 0.0,
    },
}

ASSET_ROLE_RULES: dict[str, dict[str, Any]] = {
    "master": {
        "label": "Production master asset",
        "allowed_extensions": {".jpg", ".jpeg", ".png"},
    },
    # Legacy roles still recognized for existing uploads
    "paper_border_ready": {
        "label": "Bordered print asset (legacy)",
        "allowed_extensions": {".jpg", ".jpeg", ".png"},
    },
    "clean_master": {
        "label": "Clean production asset (legacy)",
        "allowed_extensions": {".jpg", ".jpeg", ".png"},
    },
}


class ArtworkPrintWorkflowService:
    def __init__(self, db):
        self.db = db
        self.storefront_repository = ProdigiStorefrontRepository(db.session)

    async def get_workflow(self, artwork_id: int) -> dict[str, Any]:
        artwork = await self._get_artwork_orm(artwork_id)
        assets = await self.db.artwork_print_assets.list_for_artwork(artwork.id)
        bake = await self.storefront_repository.get_active_bake()

        ratio_label = artwork.print_aspect_ratio.label if artwork.print_aspect_ratio else None
        ratio_assigned = bool(ratio_label)
        size_catalog, provider_attribute_coverage = await self._build_size_catalog_with_provider_coverage(
            bake=bake,
            ratio_label=ratio_label,
        )
        selected_canvas_wrap = self._get_selected_canvas_wrap(artwork)
        if selected_canvas_wrap:
            size_catalog = await self._apply_canvas_wrap_to_size_catalog(
                size_catalog=size_catalog,
                selected_wrap=selected_canvas_wrap,
            )

        print_enabled = self._artwork_has_prints(artwork)
        orientation = str(getattr(artwork, "orientation", "") or "").lower()
        master_assets = self._index_master_assets(assets)

        slots = [
            self._build_slot_status(
                slot_id=slot_id,
                slot_def=slot_def,
                artwork=artwork,
                orientation=orientation,
                size_catalog=size_catalog,
                master_assets=master_assets,
                all_assets=assets,
                print_enabled=print_enabled,
                ratio_assigned=ratio_assigned,
                provider_attribute_coverage=provider_attribute_coverage,
                selected_canvas_wrap=selected_canvas_wrap,
            )
            for slot_id, slot_def in MASTER_SLOTS.items()
        ]
        overall_status = self._compute_overall_status(slots, print_enabled)

        return {
            "artwork_id": int(artwork.id),
            "provider_key": get_print_provider().provider_key,
            "print_enabled": print_enabled,
            "ratio_assigned": ratio_assigned,
            "ratio_label": ratio_label,
            "active_bake": {
                "id": bake.id,
                "bake_key": bake.bake_key,
            }
            if bake
            else None,
            "master_slots": slots,
            "overall_status": overall_status,
            "readiness_summary": self._build_readiness_summary(
                slots,
                overall_status,
                print_enabled=print_enabled,
                ratio_assigned=ratio_assigned,
            ),
        }

    async def build_bulk_readiness_summaries(self, artworks: list[Any]) -> dict[int, dict[str, Any]]:
        if not artworks:
            return {}

        artwork_ids = [int(a.id) for a in artworks]
        assets = await self.db.artwork_print_assets.list_for_artwork_ids(artwork_ids)
        assets_by_artwork: dict[int, list[Any]] = defaultdict(list)
        for asset in assets:
            assets_by_artwork[int(asset.artwork_id)].append(asset)

        bake = await self.storefront_repository.get_active_bake()
        ratio_labels = sorted(
            {
                a.print_aspect_ratio.label
                for a in artworks
                if getattr(a, "print_aspect_ratio", None)
                and getattr(a.print_aspect_ratio, "label", None)
            }
        )
        size_catalogs: dict[str, dict[str, dict[str, Any]]] = {}
        for ratio in ratio_labels:
            size_catalogs[ratio] = await self._build_size_catalog(bake=bake, ratio_label=ratio)

        summaries: dict[int, dict[str, Any]] = {}
        for artwork in artworks:
            ratio_label = artwork.print_aspect_ratio.label if getattr(artwork, "print_aspect_ratio", None) else None
            ratio_assigned = bool(ratio_label)
            size_catalog = deepcopy(size_catalogs.get(ratio_label or "", {}))
            selected_canvas_wrap = self._get_selected_canvas_wrap(artwork)
            if selected_canvas_wrap:
                size_catalog = await self._apply_canvas_wrap_to_size_catalog(
                    size_catalog=size_catalog,
                    selected_wrap=selected_canvas_wrap,
                )
            print_enabled = self._artwork_has_prints(artwork)
            orientation = str(getattr(artwork, "orientation", "") or "").lower()
            artwork_assets = assets_by_artwork.get(int(artwork.id), [])
            master_assets = self._index_master_assets(artwork_assets)

            slots = [
                self._build_slot_status(
                    slot_id=slot_id,
                    slot_def=slot_def,
                    artwork=artwork,
                    orientation=orientation,
                    size_catalog=size_catalog,
                    master_assets=master_assets,
                all_assets=artwork_assets,
                print_enabled=print_enabled,
                ratio_assigned=ratio_assigned,
                provider_attribute_coverage={},
                selected_canvas_wrap=selected_canvas_wrap,
            )
            for slot_id, slot_def in MASTER_SLOTS.items()
        ]
            overall_status = self._compute_overall_status(slots, print_enabled)
            summaries[int(artwork.id)] = self._build_readiness_summary(
                slots,
                overall_status,
                print_enabled=print_enabled,
                ratio_assigned=ratio_assigned,
            )

        return summaries

    async def upsert_prepared_asset(
        self,
        *,
        artwork_id: int,
        provider_key: str,
        category_id: str | None,
        asset_role: str,
        slot_size_label: str | None,
        file_url: str,
        file_name: str,
        file_ext: str,
        mime_type: str | None,
        file_size_bytes: int | None,
        checksum_sha256: str | None,
        file_metadata: dict[str, Any] | None,
        note: str | None = None,
    ) -> Any:
        from src.schemas.artwork_print_assets import ArtworkPrintAssetAdd, ArtworkPrintAssetPatch

        existing = await self.db.artwork_print_assets.get_one_or_none(
            artwork_id=artwork_id,
            provider_key=provider_key,
            category_id=category_id,
            asset_role=asset_role,
            slot_size_label=slot_size_label,
        )
        if existing is None:
            return await self.db.artwork_print_assets.add(
                ArtworkPrintAssetAdd(
                    artwork_id=artwork_id,
                    provider_key=provider_key,
                    category_id=category_id,
                    asset_role=asset_role,
                    slot_size_label=slot_size_label,
                    file_url=file_url,
                    file_name=file_name,
                    file_ext=file_ext,
                    mime_type=mime_type,
                    file_size_bytes=file_size_bytes,
                    checksum_sha256=checksum_sha256,
                    file_metadata=file_metadata,
                    note=note,
                )
            )

        await self.db.artwork_print_assets.edit(
            ArtworkPrintAssetPatch(
                file_url=file_url,
                file_name=file_name,
                file_ext=file_ext,
                mime_type=mime_type,
                file_size_bytes=file_size_bytes,
                checksum_sha256=checksum_sha256,
                file_metadata=file_metadata,
                note=note,
            ),
            id=existing.id,
        )
        return await self.db.artwork_print_assets.get_one(id=existing.id)

    async def delete_prepared_asset(self, asset_id: int) -> None:
        await self.db.artwork_print_assets.delete_one(asset_id)

    def validate_asset_upload_scope(self, *, asset_role: str, file_ext: str) -> None:
        rule = ASSET_ROLE_RULES.get(asset_role)
        if rule is None:
            raise ValueError(f"Unsupported asset role: {asset_role}")
        if file_ext.lower() not in rule["allowed_extensions"]:
            raise ValueError(
                f"Unsupported extension for {asset_role}. "
                f"Allowed: {', '.join(sorted(rule['allowed_extensions']))}"
            )

    async def validate_master_upload_dimensions(
        self,
        *,
        artwork_id: int,
        asset_role: str,
        width_px: int,
        height_px: int,
    ) -> None:
        slot_id, slot_def = self._find_slot_by_asset_role(asset_role)
        artwork = await self._get_artwork_orm(artwork_id)
        ratio_label = artwork.print_aspect_ratio.label if artwork.print_aspect_ratio else None
        if not ratio_label:
            return

        bake = await self.storefront_repository.get_active_bake()
        size_catalog = await self._build_size_catalog(bake=bake, ratio_label=ratio_label)
        selected_canvas_wrap = self._get_selected_canvas_wrap(artwork)
        if slot_id == "master" and self._artwork_has_wrapped_canvas(artwork) and not selected_canvas_wrap:
            raise ValueError("Choose a canvas wrap in Offerings before uploading the clean master.")
        if selected_canvas_wrap:
            size_catalog = await self._apply_canvas_wrap_to_size_catalog(
                size_catalog=size_catalog,
                selected_wrap=selected_canvas_wrap,
            )

        artwork_orientation = str(getattr(artwork, "orientation", "") or "").lower()
        accepted_dimensions = self._accepted_master_upload_dimensions(
            slot_id=slot_id,
            artwork=artwork,
            artwork_orientation=artwork_orientation,
            slot_def=slot_def,
            size_catalog=size_catalog,
            selected_canvas_wrap=selected_canvas_wrap,
        )
        if (width_px, height_px) in accepted_dimensions:
            return

        orientation = self._orientation_from_dimensions(width_px, height_px) or artwork_orientation
        largest_size = self._find_largest_size(
            covers=slot_def["covers_categories"],
            size_catalog=size_catalog,
            orientation=orientation,
            wrap_margin_pct=float(slot_def.get("wrap_margin_pct", 0.0)),
        )
        if largest_size is None:
            return

        guidance = self._build_export_guidance(
            slot_id=slot_id,
            artwork=artwork,
            orientation=orientation,
            largest_size=largest_size,
            selected_canvas_wrap=selected_canvas_wrap,
        )
        if guidance is None:
            return

        expected_width = int(guidance["target_width_px"])
        expected_height = int(guidance["target_height_px"])
        if width_px == expected_width and height_px == expected_height:
            return

        slot_label = "production master"
        target_label = (
            "exact upload target"
        )
        message = (
            f"Uploaded {slot_label} is {width_px}x{height_px} px, but this slot expects the "
            f"{target_label} {expected_width}x{expected_height} px."
        )
        if width_px == expected_height and height_px == expected_width:
            message += (
                " The dimensions match the opposite orientation, but this upload still "
                "does not cover the selected production target."
            )
        raise ValueError(message)

    @staticmethod
    def extract_prepared_asset_metadata(file_path: str, public_url: str | None = None) -> dict[str, Any]:
        path = Path(file_path)
        with Image.open(path) as img:
            dpi_info = img.info.get("dpi")
            dpi_x = round(float(dpi_info[0]), 2) if isinstance(dpi_info, tuple) and len(dpi_info) >= 2 else None
            dpi_y = round(float(dpi_info[1]), 2) if isinstance(dpi_info, tuple) and len(dpi_info) >= 2 else None
            width_px, height_px = img.size
            return {
                "public_url": public_url,
                "file_name": path.name,
                "file_size_bytes": os.path.getsize(path),
                "format": img.format,
                "mode": img.mode,
                "width_px": width_px,
                "height_px": height_px,
                "dpi_x": dpi_x,
                "dpi_y": dpi_y,
                "icc_profile_present": bool(img.info.get("icc_profile")),
            }

    @staticmethod
    def compute_sha256(file_path: str) -> str:
        hasher = hashlib.sha256()
        with open(file_path, "rb") as file_obj:
            for chunk in iter(lambda: file_obj.read(1024 * 1024), b""):
                hasher.update(chunk)
        return hasher.hexdigest()

    async def generate_derivatives_for_master(self, *, artwork_id: int, asset_role: str) -> list[Any]:
        slot_id, slot_def = self._find_slot_by_asset_role(asset_role)
        artwork = await self._get_artwork_orm(artwork_id)
        assets = await self.db.artwork_print_assets.list_for_artwork(artwork_id)
        master_assets = self._index_master_assets(assets)
        master_asset = master_assets.get(asset_role)
        if master_asset is None:
            return []

        await self.delete_generated_assets_for_master(master_asset)

        master_path = str(master_asset.file_url or "").lstrip("/")
        if not master_path or not os.path.exists(master_path):
            return []

        bake = await self.storefront_repository.get_active_bake()
        ratio_label = artwork.print_aspect_ratio.label if artwork.print_aspect_ratio else None
        size_catalog = await self._build_size_catalog(bake=bake, ratio_label=ratio_label)
        selected_canvas_wrap = self._get_selected_canvas_wrap(artwork)
        if slot_id == "master" and self._artwork_has_wrapped_canvas(artwork) and not selected_canvas_wrap:
            raise ValueError("Choose a canvas wrap in Offerings before uploading the clean master.")
        if selected_canvas_wrap:
            size_catalog = await self._apply_canvas_wrap_to_size_catalog(
                size_catalog=size_catalog,
                selected_wrap=selected_canvas_wrap,
            )
        orientation = str(getattr(artwork, "orientation", "") or "").lower()
        orientation = self._orientation_for_asset(
            fallback=orientation,
            asset_metadata=master_asset.file_metadata or {},
        )

        generated_assets: list[Any] = []
        with Image.open(master_path) as source_img:
            for category_id in slot_def["covers_categories"]:
                generated_assets.extend(
                    await self._generate_category_resize_derivatives(
                        artwork_id=artwork_id,
                        master_asset=master_asset,
                        source_img=source_img,
                        category_id=category_id,
                        size_catalog=size_catalog,
                        orientation=orientation,
                        wrap_margin_pct=float(slot_def.get("wrap_margin_pct", 0.0)),
                        slot_id=slot_id,
                    )
                )

            for category_id in slot_def.get("derives_categories", []):
                generated_assets.extend(
                    await self._generate_canvas_rolled_derivatives(
                        artwork_id=artwork_id,
                        master_asset=master_asset,
                        source_img=source_img,
                        category_id=category_id,
                        size_catalog=size_catalog,
                        orientation=orientation,
                        wrap_margin_pct=float(slot_def.get("wrap_margin_pct", 0.0)),
                        slot_id=slot_id,
                    )
                )

        return generated_assets

    async def delete_generated_assets_for_master(self, master_asset: Any) -> None:
        assets = await self.db.artwork_print_assets.list_for_artwork(int(master_asset.artwork_id))
        for asset in assets:
            metadata = asset.file_metadata or {}
            if not isinstance(metadata, dict):
                continue
            if metadata.get("generated_from_asset_id") != master_asset.id:
                continue
            await self.db.artwork_print_assets.delete_one(asset.id)
            file_path = str(asset.file_url or "").lstrip("/")
            if file_path and os.path.exists(file_path):
                os.remove(file_path)

    def _build_slot_status(
        self,
        *,
        slot_id: str,
        slot_def: dict[str, Any],
        artwork: Any,
        orientation: str,
        size_catalog: dict[str, dict[str, Any]],
        master_assets: dict[str, Any],
        all_assets: list[Any],
        print_enabled: bool,
        ratio_assigned: bool,
        provider_attribute_coverage: dict[str, Any],
        selected_canvas_wrap: str | None,
    ) -> dict[str, Any]:
        asset_role = slot_def["asset_role"]
        covers = list(slot_def["covers_categories"])
        derives = list(slot_def.get("derives_categories", []))
        slot_categories = covers + derives
        slot_active = print_enabled and self._slot_has_active_categories(artwork, slot_categories)
        slot_relevant = slot_active
        uploaded_asset = master_assets.get(asset_role)
        asset_metadata = (uploaded_asset.file_metadata or {}) if uploaded_asset else {}
        slot_orientation = self._orientation_for_asset(
            fallback=orientation,
            asset_metadata=asset_metadata,
        )
        slot_has_available_sizes = self._slot_has_available_sizes(slot_categories, size_catalog)
        largest_size = self._find_largest_size(
            covers=covers,
            size_catalog=size_catalog,
            orientation=slot_orientation,
            wrap_margin_pct=float(slot_def.get("wrap_margin_pct", 0.0)),
        )
        issues: list[str] = []
        warnings: list[str] = []
        artwork_ratio = self._ratio_from_artwork(artwork, orientation=slot_orientation)

        if slot_relevant and not ratio_assigned:
            issues.append("Choose a print aspect ratio in Basics before uploading masters.")
        elif (
            slot_relevant
            and slot_id == "master"
            and self._artwork_has_wrapped_canvas(artwork)
            and not selected_canvas_wrap
        ):
            issues.append("Choose a canvas wrap in Offerings before uploading the clean master.")
        elif slot_relevant and not slot_has_available_sizes:
            warnings.append("No baked storefront sizes were found for this artwork ratio yet.")
        elif slot_relevant and uploaded_asset is None:
            issues.append("Upload the production master for this slot.")

        if slot_relevant and ratio_assigned and uploaded_asset is not None and largest_size:
            uploaded_w = int(asset_metadata.get("width_px") or 0)
            uploaded_h = int(asset_metadata.get("height_px") or 0)
            required_w = largest_size["required_width_px"]
            required_h = largest_size["required_height_px"]
            if slot_id == "master":
                strict_ratio_target = self._build_strict_ratio_cover_target(
                    artwork=artwork,
                    orientation=slot_orientation,
                    exact_width=required_w,
                    exact_height=required_h,
                )
                can_cover_exact = self._can_cover_target(
                    uploaded_w,
                    uploaded_h,
                    target_width=required_w,
                    target_height=required_h,
                )
                provider_aspect_error = self._aspect_error_px(
                    uploaded_w,
                    uploaded_h,
                    required_w,
                    required_h,
                )
                strict_aspect_error = None
                if strict_ratio_target is not None:
                    strict_aspect_error = self._aspect_error_px(
                        uploaded_w,
                        uploaded_h,
                        strict_ratio_target["width_px"],
                        strict_ratio_target["height_px"],
                    )

                matches_provider_ratio = provider_aspect_error is None or provider_aspect_error <= 1.0
                matches_artwork_ratio = (
                    strict_aspect_error is not None and strict_aspect_error <= 1.0
                )

                if not can_cover_exact:
                    recommended = (
                        f"{strict_ratio_target['width_px']}x{strict_ratio_target['height_px']} px"
                        if strict_ratio_target is not None
                        else f"{required_w}x{required_h} px"
                    )
                    issues.append(
                        f"Uploaded file is {uploaded_w}x{uploaded_h} px but the largest size "
                        f"needs enough pixels to cover the exact provider target "
                        f"{required_w}x{required_h} px. Safe strict-ratio upload target: {recommended}."
                    )
                elif not matches_provider_ratio and not matches_artwork_ratio:
                    issues.append(
                        "Uploaded clean master does not match either the artwork ratio or the "
                        "exact provider target ratio. The workflow can crop a few edge pixels for "
                        "minor provider drift, but it will not stretch arbitrary ratios."
                    )
                elif matches_artwork_ratio and not matches_provider_ratio:
                    pass
            else:
                if uploaded_w < required_w or uploaded_h < required_h:
                    issues.append(
                        f"Uploaded file is {uploaded_w}x{uploaded_h} px but the largest size "
                        f"requires at least {required_w}x{required_h} px at {TARGET_DPI} DPI."
                    )

                aspect_error_px = self._aspect_error_px(uploaded_w, uploaded_h, required_w, required_h)
                if aspect_error_px is not None and aspect_error_px > 1.0:
                    issues.append(
                        "Uploaded master aspect ratio does not match the target print area. "
                        f"Expected {required_w}x{required_h} ratio; current file would drift "
                        f"by about {round(aspect_error_px, 2)} px on one edge."
                    )

            mode = str(asset_metadata.get("mode") or "")
            if mode and mode not in {"RGB", "RGBA"}:
                warnings.append(
                    f"Color mode is {mode}. Prodigi expects RGB and may auto-convert the file."
                )

        status = "ready"
        if not slot_relevant:
            status = "not_required"
        elif issues:
            status = "blocked"
        elif warnings:
            status = "attention"

        required_for_sizes = self._collect_required_for_sizes(covers + derives, size_catalog)
        generated_derivatives_count = self._count_generated_derivatives(uploaded_asset, all_assets)

        return {
            "slot_id": slot_id,
            "label": slot_def["label"],
            "description": slot_def["description"],
            "asset_role": asset_role,
            "covers_categories": covers,
            "derives_categories": derives,
            "relevant": slot_relevant,
            "status": status,
            "required_min_px": {
                "width": largest_size["required_width_px"],
                "height": largest_size["required_height_px"],
                "source": largest_size["print_area_source"],
                "print_area_name": largest_size["print_area_name"],
                "visible_art_width_px": largest_size.get("visible_art_width_px"),
                "visible_art_height_px": largest_size.get("visible_art_height_px"),
                "physical_width_in": largest_size.get("physical_width_in"),
                "physical_height_in": largest_size.get("physical_height_in"),
            }
            if largest_size
            else None,
            "required_min_px_source": largest_size["print_area_source"] if largest_size else None,
            "export_guidance": self._build_export_guidance(
                slot_id=slot_id,
                artwork=artwork,
                orientation=slot_orientation,
                largest_size=largest_size,
                selected_canvas_wrap=selected_canvas_wrap,
            ),
            "derivative_plan": self._build_derivative_plan(
                slot_id=slot_id,
                covers=covers,
                derives=derives,
                size_catalog=size_catalog,
                orientation=slot_orientation,
                wrap_margin_pct=float(slot_def.get("wrap_margin_pct", 0.0)),
                largest_size=largest_size,
                artwork_ratio=artwork_ratio,
            ),
            "provider_attribute_coverage": self._build_slot_provider_attribute_coverage(
                categories=slot_categories,
                provider_attribute_coverage=provider_attribute_coverage,
            ),
            "largest_size_label": largest_size["label"] if largest_size else None,
            "required_for_sizes": required_for_sizes,
            "covered_size_count": len(required_for_sizes),
            "generated_derivatives_count": generated_derivatives_count,
            "uploaded_asset": uploaded_asset.model_dump(mode="json") if uploaded_asset else None,
            "validation": {
                "issues": issues,
                "warnings": warnings,
            },
            "issues": issues,
            "warnings": warnings,
        }

    def _build_export_guidance(
        self,
        *,
        slot_id: str,
        artwork: Any,
        orientation: str,
        largest_size: dict[str, Any] | None,
        selected_canvas_wrap: str | None,
    ) -> dict[str, Any] | None:
        if largest_size is None:
            return None

        target_width = int(largest_size["required_width_px"])
        target_height = int(largest_size["required_height_px"])
        artwork_ratio = self._ratio_from_artwork(artwork, orientation=orientation)
        target_ratio = self._safe_ratio(target_width, target_height)
        ratio_diff_px = None
        ratio_warning = False
        if artwork_ratio and target_ratio:
            expected_height = target_width / artwork_ratio
            expected_width = target_height * artwork_ratio
            ratio_diff_px = round(min(abs(target_height - expected_height), abs(target_width - expected_width)), 2)
            ratio_warning = ratio_diff_px > 1.0

        strict_ratio_target = None
        if slot_id == "master":
            strict_ratio_target = self._build_strict_ratio_cover_target(
                artwork=artwork,
                orientation=orientation,
                exact_width=target_width,
                exact_height=target_height,
            )

        if slot_id == "master" and strict_ratio_target is not None:
            cover_crop = self._estimated_cover_crop_px(
                strict_ratio_target["width_px"],
                strict_ratio_target["height_px"],
                target_width=target_width,
                target_height=target_height,
            )
            wrap_note = (
                f"Selected canvas wrap: {selected_canvas_wrap}. "
                if selected_canvas_wrap
                else ""
            )
            message = (
                "Export one large clean master in the artwork ratio. We will generate exact "
                "provider artboards from it. Each target is cover-fitted first, then only the "
                "overflow edge is center-cropped when provider pixels drift slightly from the "
                "artwork ratio, instead of stretching or padding. "
                f"{wrap_note}Do not manually stretch or distort the artwork."
            )
            return {
                "mode": "strict_ratio_cover_master",
                "title": "Export strict-ratio clean master",
                "message": message,
                "target_width_px": strict_ratio_target["width_px"],
                "target_height_px": strict_ratio_target["height_px"],
                "source": largest_size["print_area_source"],
                "print_area_name": largest_size["print_area_name"],
                "artwork_ratio": round(artwork_ratio, 6) if artwork_ratio else None,
                "target_ratio": round(target_ratio, 6) if target_ratio else None,
                "full_file_ratio_diff_px": ratio_diff_px,
                "full_file_ratio_diff_warning": ratio_warning,
                "visible_art_width_px": largest_size.get("visible_art_width_px"),
                "visible_art_height_px": largest_size.get("visible_art_height_px"),
                "physical_width_in": largest_size.get("physical_width_in"),
                "physical_height_in": largest_size.get("physical_height_in"),
                "provider_target_width_px": target_width,
                "provider_target_height_px": target_height,
                "provider_target_differs_from_visible_art": (
                    largest_size.get("visible_art_width_px") not in {None, target_width}
                    or largest_size.get("visible_art_height_px") not in {None, target_height}
                ),
                "estimated_cover_crop_width_px": cover_crop["width_px"],
                "estimated_cover_crop_height_px": cover_crop["height_px"],
                "ratio_label": strict_ratio_target["ratio_label"],
            }
        if slot_id == "master":
            message = (
                "Create a clean front artwork file exactly at the provider target size. "
                "Use it for framed paper and canvas. Prodigi receives canvas files with "
                "wrap=MirrorWrap and generates the sides itself, so do not include manual "
                "wrap margins in this file."
            )
        elif slot_id == "paper_bordered":
            message = (
                "Create a PNG artboard exactly at the provider target size. The white border is "
                "part of this file, so place the artwork inside the artboard and export the final "
                "bordered print area without relying on automatic proportional upscale."
            )
        else:
            message = (
                "Create a PNG artboard exactly at the provider target size. Preserve the artwork "
                "ratio inside the file and export the final clean print area at these exact pixels."
            )

        return {
            "mode": "exact_artboard",
            "title": "Export exact target artboard",
            "message": message,
            "target_width_px": target_width,
            "target_height_px": target_height,
            "source": largest_size["print_area_source"],
            "print_area_name": largest_size["print_area_name"],
            "artwork_ratio": round(artwork_ratio, 6) if artwork_ratio else None,
            "target_ratio": round(target_ratio, 6) if target_ratio else None,
            "full_file_ratio_diff_px": ratio_diff_px,
            "full_file_ratio_diff_warning": ratio_warning,
            "visible_art_width_px": largest_size.get("visible_art_width_px"),
            "visible_art_height_px": largest_size.get("visible_art_height_px"),
            "physical_width_in": largest_size.get("physical_width_in"),
            "physical_height_in": largest_size.get("physical_height_in"),
            "provider_target_differs_from_visible_art": (
                largest_size.get("visible_art_width_px") not in {None, target_width}
                or largest_size.get("visible_art_height_px") not in {None, target_height}
            ),
        }

    async def _generate_category_resize_derivatives(
        self,
        *,
        artwork_id: int,
        master_asset: Any,
        source_img: Image.Image,
        category_id: str,
        size_catalog: dict[str, dict[str, Any]],
        orientation: str,
        wrap_margin_pct: float,
        slot_id: str,
    ) -> list[Any]:
        generated: list[Any] = []
        master_width = int((master_asset.file_metadata or {}).get("width_px") or 0)
        master_height = int((master_asset.file_metadata or {}).get("height_px") or 0)
        out_dir = self._build_derivative_output_dir(artwork_id, slot_id, category_id)
        os.makedirs(out_dir, exist_ok=True)
        icc_profile = source_img.info.get("icc_profile")

        for label, dims in sorted(size_catalog.get(category_id, {}).items(), key=lambda item: item[1]["short_cm"]):
            if not dims["available"]:
                continue
            required_width, required_height = self._resolve_required_pixels(
                dims=dims,
                orientation=orientation,
                wrap_margin_pct=wrap_margin_pct,
            )
            if required_width > master_width or required_height > master_height:
                continue
            derivative, derivative_kind = self._build_exact_derivative_image(
                source_img=source_img,
                target_width=required_width,
                target_height=required_height,
                slot_id=slot_id,
            )
            generated.append(
                await self._store_generated_derivative(
                    artwork_id=artwork_id,
                    master_asset=master_asset,
                    derivative_img=derivative,
                    category_id=category_id,
                    slot_size_label=label,
                    output_dir=out_dir,
                    base_name=self._sanitize_path_fragment(label, "variant"),
                    derivative_kind=derivative_kind,
                    icc_profile=icc_profile,
                )
            )

        return generated

    async def _generate_canvas_rolled_derivatives(
        self,
        *,
        artwork_id: int,
        master_asset: Any,
        source_img: Image.Image,
        category_id: str,
        size_catalog: dict[str, dict[str, Any]],
        orientation: str,
        wrap_margin_pct: float,
        slot_id: str,
    ) -> list[Any]:
        generated: list[Any] = []
        out_dir = self._build_derivative_output_dir(artwork_id, slot_id, category_id)
        os.makedirs(out_dir, exist_ok=True)
        icc_profile = source_img.info.get("icc_profile")
        for label, dims in sorted(size_catalog.get(category_id, {}).items(), key=lambda item: item[1]["short_cm"]):
            if not dims["available"]:
                continue
            required_width, required_height = self._resolve_required_pixels(
                dims=dims,
                orientation=orientation,
                wrap_margin_pct=0.0,
            )
            derivative, derivative_kind = self._build_exact_derivative_image(
                source_img=source_img,
                target_width=required_width,
                target_height=required_height,
                slot_id=slot_id,
            )
            generated.append(
                await self._store_generated_derivative(
                    artwork_id=artwork_id,
                    master_asset=master_asset,
                    derivative_img=derivative,
                    category_id=category_id,
                    slot_size_label=label,
                    output_dir=out_dir,
                    base_name=self._sanitize_path_fragment(label, "variant"),
                    derivative_kind=derivative_kind,
                    icc_profile=icc_profile,
                )
            )

        return generated

    async def _store_generated_derivative(
        self,
        *,
        artwork_id: int,
        master_asset: Any,
        derivative_img: Image.Image,
        category_id: str,
        slot_size_label: str,
        output_dir: str,
        base_name: str,
        derivative_kind: str,
        icc_profile: Any,
    ) -> Any:
        filename = f"{base_name}_{master_asset.id}.png"
        dest_path = os.path.join(output_dir, filename)
        save_kwargs: dict[str, Any] = {}
        if icc_profile:
            save_kwargs["icc_profile"] = icc_profile
        if derivative_img.mode not in {"RGB", "RGBA", "L"}:
            derivative_img = derivative_img.convert("RGBA" if "A" in derivative_img.getbands() else "RGB")
        derivative_img.save(dest_path, format="PNG", **save_kwargs)
        public_url = "/" + dest_path.replace("\\", "/")
        metadata = self.extract_prepared_asset_metadata(dest_path, public_url=public_url)
        metadata.update(
            {
                "generated_from_asset_id": master_asset.id,
                "generated_from_asset_role": master_asset.asset_role,
                "derivative_kind": derivative_kind,
            }
        )
        return await self.upsert_prepared_asset(
            artwork_id=artwork_id,
            provider_key=get_print_provider().provider_key,
            category_id=category_id,
            asset_role=master_asset.asset_role,
            slot_size_label=slot_size_label,
            file_url=public_url,
            file_name=filename,
            file_ext=".png",
            mime_type="image/png",
            file_size_bytes=metadata.get("file_size_bytes"),
            checksum_sha256=self.compute_sha256(dest_path),
            file_metadata=metadata,
            note="Auto-generated from master slot",
        )

    def _build_exact_derivative_image(
        self,
        *,
        source_img: Image.Image,
        target_width: int,
        target_height: int,
        slot_id: str,
    ) -> tuple[Image.Image, str]:
        source_width, source_height = source_img.size
        aspect_error_px = self._aspect_error_px(
            source_width,
            source_height,
            target_width,
            target_height,
        )
        if aspect_error_px is None or aspect_error_px <= 1.0:
            return (
                source_img.resize((target_width, target_height), Image.Resampling.LANCZOS),
                "resize",
            )

        if slot_id == "paper_bordered":
            return (
                self._contain_on_white_artboard(source_img, target_width, target_height),
                "contain_pad_resize",
            )

        if slot_id == "master":
            return (
                self._cover_crop_to_exact_artboard(source_img, target_width, target_height),
                "cover_crop_resize",
            )

        return (
            source_img.resize((target_width, target_height), Image.Resampling.LANCZOS),
            "resize",
        )

    def _contain_on_white_artboard(
        self,
        source_img: Image.Image,
        target_width: int,
        target_height: int,
    ) -> Image.Image:
        fitted = ImageOps.contain(
            source_img,
            (target_width, target_height),
            method=Image.Resampling.LANCZOS,
        )
        if fitted.mode not in {"RGB", "RGBA", "L"}:
            fitted = fitted.convert("RGBA" if "A" in fitted.getbands() else "RGB")
        canvas_mode = "RGBA" if fitted.mode == "RGBA" else "RGB"
        background = (255, 255, 255, 0) if canvas_mode == "RGBA" else "white"
        canvas = Image.new(canvas_mode, (target_width, target_height), background)
        left = round((target_width - fitted.width) / 2)
        top = round((target_height - fitted.height) / 2)
        if fitted.mode == "RGBA":
            canvas.alpha_composite(fitted, (left, top))
        else:
            canvas.paste(fitted, (left, top))
        return canvas

    def _cover_crop_to_exact_artboard(
        self,
        source_img: Image.Image,
        target_width: int,
        target_height: int,
    ) -> Image.Image:
        return ImageOps.fit(
            source_img,
            (target_width, target_height),
            method=Image.Resampling.LANCZOS,
            centering=(0.5, 0.5),
        )

    def _find_slot_by_asset_role(self, asset_role: str) -> tuple[str, dict[str, Any]]:
        for slot_id, slot_def in MASTER_SLOTS.items():
            if slot_def["asset_role"] == asset_role:
                return slot_id, slot_def
        raise ValueError(f"Unsupported asset role: {asset_role}")

    def _accepted_master_upload_dimensions(
        self,
        *,
        slot_id: str,
        artwork: Any,
        artwork_orientation: str,
        slot_def: dict[str, Any],
        size_catalog: dict[str, dict[str, Any]],
        selected_canvas_wrap: str | None,
    ) -> set[tuple[int, int]]:
        accepted: set[tuple[int, int]] = set()
        for orientation in self._candidate_orientations(artwork_orientation):
            largest_size = self._find_largest_size(
                covers=slot_def["covers_categories"],
                size_catalog=size_catalog,
                orientation=orientation,
                wrap_margin_pct=float(slot_def.get("wrap_margin_pct", 0.0)),
            )
            if largest_size is None:
                continue
            guidance = self._build_export_guidance(
                slot_id=slot_id,
                artwork=artwork,
                orientation=orientation,
                largest_size=largest_size,
                selected_canvas_wrap=selected_canvas_wrap,
            )
            if guidance is None:
                continue
            accepted.add((int(guidance["target_width_px"]), int(guidance["target_height_px"])))
        return accepted

    def _candidate_orientations(self, orientation: str) -> tuple[str, ...]:
        normalized = "horizontal" if orientation == "horizontal" else "vertical"
        opposite = "vertical" if normalized == "horizontal" else "horizontal"
        return normalized, opposite

    def _orientation_for_asset(
        self,
        *,
        fallback: str,
        asset_metadata: dict[str, Any],
    ) -> str:
        width = int(asset_metadata.get("width_px") or 0)
        height = int(asset_metadata.get("height_px") or 0)
        return self._orientation_from_dimensions(width, height) or fallback

    def _orientation_from_dimensions(self, width: int, height: int) -> str | None:
        if width <= 0 or height <= 0 or width == height:
            return None
        return "horizontal" if width > height else "vertical"

    def _count_generated_derivatives(self, uploaded_asset: Any | None, all_assets: list[Any]) -> int:
        if uploaded_asset is None:
            return 0
        count = 0
        for asset in all_assets:
            metadata = asset.file_metadata or {}
            if not isinstance(metadata, dict):
                continue
            if metadata.get("generated_from_asset_id") == uploaded_asset.id:
                count += 1
        return count

    def _find_largest_size(
        self,
        *,
        covers: list[str],
        size_catalog: dict[str, dict[str, Any]],
        orientation: str,
        wrap_margin_pct: float,
    ) -> dict[str, Any] | None:
        largest = None
        largest_area = 0
        for category_id in covers:
            for label, dims in size_catalog.get(category_id, {}).items():
                if not dims["available"]:
                    continue
                print_area_dimensions = self._normalize_print_area_dimensions(
                    dims.get("print_area_dimensions")
                )
                required_width, required_height = self._resolve_required_pixels(
                    dims=dims,
                    orientation=orientation,
                    wrap_margin_pct=wrap_margin_pct,
                )
                area = required_width * required_height
                if area > largest_area:
                    largest_area = area
                    largest = {
                        "label": label,
                        "required_width_px": required_width,
                        "required_height_px": required_height,
                        "print_area_source": dims.get("print_area_source") or "computed_fallback",
                        "print_area_name": dims.get("print_area_name") or "default",
                        "print_area_dimensions": dims.get("print_area_dimensions"),
                        "supplier_size_inches": dims.get("supplier_size_inches"),
                        "supplier_size_cm": dims.get("supplier_size_cm"),
                        "visible_art_width_px": print_area_dimensions.get("visible_art_width_px"),
                        "visible_art_height_px": print_area_dimensions.get("visible_art_height_px"),
                        "physical_width_in": print_area_dimensions.get("physical_width_in")
                        or print_area_dimensions.get("width_in"),
                        "physical_height_in": print_area_dimensions.get("physical_height_in")
                        or print_area_dimensions.get("height_in"),
                    }
        return largest

    def _build_derivative_plan(
        self,
        *,
        slot_id: str,
        covers: list[str],
        derives: list[str],
        size_catalog: dict[str, dict[str, Any]],
        orientation: str,
        wrap_margin_pct: float,
        largest_size: dict[str, Any] | None,
        artwork_ratio: float | None,
    ) -> dict[str, Any]:
        if largest_size is None:
            return {
                "strategy": "missing_targets",
                "target_count": 0,
                "direct_resize_count": 0,
                "exact_recompose_count": 0,
                "can_direct_resize_all": False,
            }

        target_categories = covers + derives
        target_count = 0
        direct_count = 0
        recompose_count = 0
        for category_id in target_categories:
            for dims in size_catalog.get(category_id, {}).values():
                if not dims["available"]:
                    continue
                target_count += 1
                target_width, target_height = self._resolve_required_pixels(
                    dims=dims,
                    orientation=orientation,
                    wrap_margin_pct=0.0 if category_id in derives else wrap_margin_pct,
                )
                if slot_id == "master" and artwork_ratio:
                    error_px = self._ratio_delta_px_for_ratio(
                        target_width,
                        target_height,
                        artwork_ratio=artwork_ratio,
                    )
                else:
                    error_px = self._aspect_error_px(
                        largest_size["required_width_px"],
                        largest_size["required_height_px"],
                        target_width,
                        target_height,
                    )
                if error_px is None or error_px <= 1.0:
                    direct_count += 1
                else:
                    recompose_count += 1

        if slot_id == "master":
            if recompose_count == 0:
                strategy = "direct_lanczos_resize"
                note = (
                    "All provider targets already match the artwork ratio, so the clean "
                    "master can be scaled directly without crop or stretch."
                )
            else:
                strategy = "exact_cover_crop"
                note = (
                    "Each drifted provider target is cover-fitted first and then center-cropped "
                    "only on the overflow edge needed to reach the exact artboard. This avoids "
                    "white strips and avoids stretching the artwork."
                )
        elif recompose_count == 0:
            strategy = "direct_lanczos_resize"
            note = "Every generated target has the same full-file ratio as the master."
        elif slot_id == "paper_bordered":
            strategy = "exact_contain_pad"
            note = (
                "Some paper targets differ slightly by ratio, so the bordered master is "
                "fitted onto an exact white artboard instead of being stretched."
            )
        else:
            strategy = "exact_center_crop"
            note = (
                "Some targets differ slightly by ratio, so the clean master is center-cropped "
                "onto exact provider artboards instead of being stretched."
            )

        return {
            "strategy": strategy,
            "target_count": target_count,
            "direct_resize_count": direct_count,
            "exact_recompose_count": recompose_count,
            "can_direct_resize_all": recompose_count == 0,
            "note": note,
        }

    def _build_slot_provider_attribute_coverage(
        self,
        *,
        categories: list[str],
        provider_attribute_coverage: dict[str, Any],
    ) -> dict[str, Any] | None:
        if not any(category in WRAPPED_CANVAS_CATEGORIES for category in categories):
            return None

        canvas_wrap = provider_attribute_coverage.get("canvas_wrap")
        if not canvas_wrap:
            return None

        category_set = set(categories)
        category_rows = [
            row
            for row in canvas_wrap.get("by_category", [])
            if row.get("category_id") in category_set
        ]
        total_options = sum(int(row.get("total_options") or 0) for row in category_rows)
        if total_options <= 0:
            return None

        by_wrap: dict[str, int] = defaultdict(int)
        for row in category_rows:
            for wrap, count in (row.get("by_wrap") or {}).items():
                by_wrap[str(wrap)] += int(count or 0)

        preferred_value = canvas_wrap["preferred_value"]
        preferred_count = int(by_wrap.get(preferred_value, 0))
        non_preferred_count = total_options - preferred_count

        return {
            "kind": "canvas_wrap",
            "attribute": "wrap",
            "preferred_value": preferred_value,
            "total_options": total_options,
            "preferred_count": preferred_count,
            "non_preferred_count": non_preferred_count,
            "strict_preferred_hidden_count": non_preferred_count,
            "coverage_pct": self._percentage(preferred_count, total_options),
            "by_wrap": dict(sorted(by_wrap.items())),
            "by_category": category_rows,
            "note": (
                f"If we enforce {preferred_value} strictly, "
                f"{non_preferred_count} option(s) in this artwork ratio would be hidden."
            ),
        }

    def _resolve_required_pixels(
        self,
        *,
        dims: dict[str, Any],
        orientation: str,
        wrap_margin_pct: float,
    ) -> tuple[int, int]:
        exact_width = dims.get("print_area_width_px")
        exact_height = dims.get("print_area_height_px")
        if exact_width and exact_height:
            return self._orient_pixels(
                int(exact_width),
                int(exact_height),
                orientation=orientation,
            )
        return self._compute_required_pixels(
            short_cm=dims["short_cm"],
            long_cm=dims["long_cm"],
            orientation=orientation,
            wrap_margin_pct=wrap_margin_pct,
        )

    def _orient_pixels(self, width: int, height: int, *, orientation: str) -> tuple[int, int]:
        if orientation == "horizontal" and width < height:
            return height, width
        if orientation != "horizontal" and width > height:
            return height, width
        return width, height

    def _compute_required_pixels(
        self,
        *,
        short_cm: float,
        long_cm: float,
        orientation: str,
        wrap_margin_pct: float,
    ) -> tuple[int, int]:
        if orientation == "horizontal":
            width_cm, height_cm = long_cm, short_cm
        else:
            width_cm, height_cm = short_cm, long_cm
        multiplier = 1.0 + (wrap_margin_pct / 100.0) * 2.0
        required_width = round((width_cm / 2.54) * TARGET_DPI * multiplier)
        required_height = round((height_cm / 2.54) * TARGET_DPI * multiplier)
        return required_width, required_height

    def _collect_required_for_sizes(
        self,
        categories: list[str],
        size_catalog: dict[str, dict[str, Any]],
    ) -> list[str]:
        seen: set[str] = set()
        ordered: list[tuple[float, str]] = []
        for category_id in categories:
            for label, dims in size_catalog.get(category_id, {}).items():
                if not dims["available"]:
                    continue
                if label in seen:
                    continue
                seen.add(label)
                ordered.append((float(dims["short_cm"]), label))
        ordered.sort(key=lambda item: item[0])
        return [label for _, label in ordered]

    def _slot_has_active_categories(self, artwork: Any, categories: list[str]) -> bool:
        for category_id in categories:
            medium = "paper" if category_id.startswith("paper") else "canvas"
            if medium == "paper":
                if getattr(artwork, "has_paper_print", False) or getattr(artwork, "has_paper_print_limited", False):
                    return True
            else:
                if getattr(artwork, "has_canvas_print", False) or getattr(artwork, "has_canvas_print_limited", False):
                    return True
        return False

    def _slot_has_available_sizes(
        self,
        categories: list[str],
        size_catalog: dict[str, dict[str, Any]],
    ) -> bool:
        return any(
            bool(dims.get("available"))
            for category_id in categories
            for dims in size_catalog.get(category_id, {}).values()
        )

    def _compute_overall_status(self, slots: list[dict[str, Any]], print_enabled: bool) -> str:
        if not print_enabled:
            return "not_required"
        relevant = [slot for slot in slots if slot["relevant"]]
        if not relevant:
            return "not_required"
        if any(slot["status"] == "blocked" for slot in relevant):
            return "blocked"
        if any(slot["status"] == "attention" for slot in relevant):
            return "attention"
        return "ready"

    def _build_readiness_summary(
        self,
        slots: list[dict[str, Any]],
        overall_status: str,
        *,
        print_enabled: bool,
        ratio_assigned: bool,
    ) -> dict[str, Any]:
        relevant = [slot for slot in slots if slot["relevant"]]
        ready_count = sum(1 for slot in relevant if slot["status"] == "ready")
        blocked_count = sum(1 for slot in relevant if slot["status"] == "blocked")
        attention_count = sum(1 for slot in relevant if slot["status"] == "attention")

        messages = {
            "ready": "All print masters are uploaded and validated.",
            "blocked": f"{blocked_count} master slot(s) still need attention.",
            "attention": "Print pipeline has warnings to review.",
            "not_required": "No print offerings are enabled.",
        }
        if print_enabled and not ratio_assigned:
            messages["blocked"] = "Choose a print aspect ratio in Basics to unlock the print pipeline."
        return {
            "status": overall_status,
            "message": messages.get(overall_status, ""),
            "total_slots": len(MASTER_SLOTS),
            "relevant_slots": len(relevant),
            "ready_slots": ready_count,
            "blocked_slots": blocked_count,
            "highlight_variant": (
                "danger" if overall_status == "blocked" else "warning" if overall_status == "attention" else "success"
            ),
            "blocking_step_count": blocked_count,
            "attention_step_count": attention_count,
            "blocking_category_count": blocked_count,
            "ready_category_count": ready_count,
            "enabled_category_count": len(relevant),
        }

    def _index_master_assets(self, assets: list[Any]) -> dict[str, Any]:
        index: dict[str, Any] = {}
        for asset in assets:
            if asset.slot_size_label is not None:
                continue
            asset_role = "master" if asset.asset_role in {"paper_clean", "canvas_clean", "clean_master"} else asset.asset_role
            existing = index.get(asset_role)
            if existing is None or int(asset.id) > int(existing.id):
                index[asset_role] = asset
        return index

    async def _get_artwork_orm(self, artwork_id: int) -> ArtworksOrm:
        query = (
            select(ArtworksOrm)
            .where(ArtworksOrm.id == artwork_id)
            .options(selectinload(ArtworksOrm.print_aspect_ratio))
        )
        result = await self.db.session.execute(query)
        artwork = result.scalar_one_or_none()
        if artwork is None:
            raise ObjectNotFoundException(detail="Artwork not found in artworks")
        return artwork

    async def _build_size_catalog(self, *, bake: Any | None, ratio_label: str | None) -> dict[str, dict[str, Any]]:
        catalog, _coverage = await self._build_size_catalog_with_provider_coverage(
            bake=bake,
            ratio_label=ratio_label,
        )
        return catalog

    async def _build_size_catalog_with_provider_coverage(
        self,
        *,
        bake: Any | None,
        ratio_label: str | None,
    ) -> tuple[dict[str, dict[str, Any]], dict[str, Any]]:
        if bake is None or not ratio_label:
            return {}, {}
        groups = await self.storefront_repository.get_groups_for_bake_ratios(bake.id, [ratio_label])
        return self._collapse_groups(groups), self._build_provider_attribute_coverage(groups)

    def _get_selected_canvas_wrap(self, artwork: Any) -> str | None:
        return extract_canvas_wrap_selection(getattr(artwork, "print_profile_overrides", None))

    def _artwork_has_wrapped_canvas(self, artwork: Any) -> bool:
        return bool(
            getattr(artwork, "has_canvas_print", False)
            or getattr(artwork, "has_canvas_print_limited", False)
        )

    async def _apply_canvas_wrap_to_size_catalog(
        self,
        *,
        size_catalog: dict[str, dict[str, Any]],
        selected_wrap: str,
    ) -> dict[str, dict[str, Any]]:
        if not size_catalog:
            return size_catalog

        async with ProdigiPrintAreaResolver() as resolver:
            for category_id in WRAPPED_CANVAS_CATEGORIES:
                for dims in size_catalog.get(category_id, {}).values():
                    sku = dims.get("sku")
                    if not sku:
                        continue
                    resolved = await resolver.resolve(
                        sku=sku,
                        destination_country=dims.get("destination_country"),
                        category_id=category_id,
                        attributes={"wrap": selected_wrap},
                        optional_attribute_keys=set(),
                        supplier_size_inches=dims.get("supplier_size_inches"),
                        supplier_size_cm=dims.get("supplier_size_cm"),
                        slot_size_label=dims.get("label"),
                        wrap_margin_pct=0.0,
                    )
                    dims["print_area_width_px"] = resolved.get("print_area_width_px")
                    dims["print_area_height_px"] = resolved.get("print_area_height_px")
                    dims["print_area_name"] = resolved.get("print_area_name")
                    dims["print_area_source"] = resolved.get("print_area_source")
                    dims["print_area_dimensions"] = resolved.get("print_area_dimensions")
        return size_catalog

    def _build_provider_attribute_coverage(self, groups: list[Any]) -> dict[str, Any]:
        by_category: dict[str, dict[str, Any]] = {}
        by_wrap: dict[str, int] = defaultdict(int)
        total_options = 0
        preferred_value = "MirrorWrap"

        for group in groups:
            category_id = getattr(group, "category_id", None)
            if category_id not in WRAPPED_CANVAS_CATEGORIES:
                continue

            category_stats = by_category.setdefault(
                category_id,
                {
                    "category_id": category_id,
                    "total_options": 0,
                    "preferred_count": 0,
                    "non_preferred_count": 0,
                    "coverage_pct": None,
                    "by_wrap": defaultdict(int),
                },
            )
            for size in getattr(group, "sizes", []) or []:
                if not getattr(size, "available", False):
                    continue
                attributes = self._extract_provider_attributes(size)
                wrap = str(attributes.get("wrap") or "unknown")
                total_options += 1
                by_wrap[wrap] += 1
                category_stats["total_options"] += 1
                category_stats["by_wrap"][wrap] += 1
                if wrap == preferred_value:
                    category_stats["preferred_count"] += 1
                else:
                    category_stats["non_preferred_count"] += 1

        category_rows = []
        for category_id, stats in sorted(by_category.items()):
            total = int(stats["total_options"])
            preferred_count = int(stats["preferred_count"])
            category_rows.append(
                {
                    **stats,
                    "by_wrap": dict(sorted(stats["by_wrap"].items())),
                    "coverage_pct": self._percentage(preferred_count, total),
                }
            )

        preferred_count = int(by_wrap.get(preferred_value, 0))
        return {
            "canvas_wrap": {
                "attribute": "wrap",
                "preferred_value": preferred_value,
                "total_options": total_options,
                "preferred_count": preferred_count,
                "non_preferred_count": total_options - preferred_count,
                "strict_preferred_hidden_count": total_options - preferred_count,
                "coverage_pct": self._percentage(preferred_count, total_options),
                "by_wrap": dict(sorted(by_wrap.items())),
                "by_category": category_rows,
            }
        }

    def _extract_provider_attributes(self, size: Any) -> dict[str, Any]:
        dimensions = self._normalize_print_area_dimensions(
            getattr(size, "print_area_dimensions", None)
        )
        attributes = dimensions.get("variant_attributes") or {}
        return dict(attributes) if isinstance(attributes, dict) else {}

    def _normalize_print_area_dimensions(self, value: Any) -> dict[str, Any]:
        if isinstance(value, str):
            try:
                value = json.loads(value)
            except json.JSONDecodeError:
                return {}
        return dict(value) if isinstance(value, dict) else {}

    def _percentage(self, count: int, total: int) -> float | None:
        if total <= 0:
            return None
        return round((count / total) * 100, 1)

    def _collapse_groups(self, groups: list[Any]) -> dict[str, dict[str, Any]]:
        catalog: dict[str, dict[str, Any]] = defaultdict(dict)
        for group in groups:
            for size in group.sizes:
                label = size.slot_size_label
                if not label:
                    continue
                dims = self._parse_size_label(label)
                if dims is None:
                    continue
                existing = catalog[group.category_id].get(label)
                candidate = {
                    "label": label,
                    "short_cm": dims["short_cm"],
                    "long_cm": dims["long_cm"],
                    "available": bool(size.available),
                    "sku": getattr(size, "sku", None),
                    "destination_country": getattr(group, "destination_country", None),
                    "source_country": getattr(size, "source_country", None),
                    "print_area_width_px": getattr(size, "print_area_width_px", None),
                    "print_area_height_px": getattr(size, "print_area_height_px", None),
                    "print_area_name": getattr(size, "print_area_name", None),
                    "print_area_source": getattr(size, "print_area_source", None),
                    "print_area_dimensions": getattr(size, "print_area_dimensions", None),
                    "supplier_size_cm": getattr(size, "supplier_size_cm", None),
                    "supplier_size_inches": getattr(size, "supplier_size_inches", None),
                }
                if (
                    existing is None
                    or (not existing["available"] and candidate["available"])
                    or (
                        existing["available"] == candidate["available"]
                        and self._candidate_print_area(candidate) > self._candidate_print_area(existing)
                    )
                ):
                    catalog[group.category_id][label] = candidate
        return {category_id: dict(items) for category_id, items in catalog.items()}

    def _parse_size_label(self, size_label: str) -> dict[str, float] | None:
        normalized = size_label.lower().replace("×", "x").replace("Ã—", "x").strip()
        match = SIZE_PATTERN.search(normalized)
        if not match:
            return None
        first = round(float(match.group("w")), 1)
        second = round(float(match.group("h")), 1)
        short_cm, long_cm = sorted((first, second))
        return {"short_cm": short_cm, "long_cm": long_cm}

    def _artwork_has_prints(self, artwork: Any) -> bool:
        return bool(
            getattr(artwork, "has_paper_print", False)
            or getattr(artwork, "has_paper_print_limited", False)
            or getattr(artwork, "has_canvas_print", False)
            or getattr(artwork, "has_canvas_print_limited", False)
        )

    def _build_derivative_output_dir(self, artwork_id: int, slot_id: str, category_id: str) -> str:
        return os.path.join(
            "static",
            "print-prep",
            str(artwork_id),
            self._sanitize_path_fragment(slot_id, "slot"),
            self._sanitize_path_fragment(category_id, "category"),
            "derived",
        )

    def _sanitize_path_fragment(self, value: str | None, fallback: str) -> str:
        raw = (value or "").strip()
        sanitized = re.sub(r"[^a-zA-Z0-9._-]+", "-", raw).strip("-_.")
        return sanitized or fallback

    def _safe_ratio(self, width: int, height: int) -> float | None:
        if width <= 0 or height <= 0:
            return None
        return width / height

    def _ratio_from_artwork(self, artwork: Any, *, orientation: str) -> float | None:
        aspect_ratio = getattr(artwork, "print_aspect_ratio", None)
        label = str(getattr(aspect_ratio, "label", "") or "")
        match = RATIO_PATTERN.search(label)
        if not match:
            return None
        first = float(match.group("w"))
        second = float(match.group("h"))
        if first <= 0 or second <= 0:
            return None
        short_side, long_side = sorted((first, second))
        if orientation == "horizontal":
            return long_side / short_side
        return short_side / long_side

    def _ratio_components_from_artwork(self, artwork: Any, *, orientation: str) -> tuple[int, int] | None:
        aspect_ratio = getattr(artwork, "print_aspect_ratio", None)
        label = str(getattr(aspect_ratio, "label", "") or "")
        return self._ratio_components_from_label(label, orientation=orientation)

    def _ratio_components_from_label(self, label: str, *, orientation: str) -> tuple[int, int] | None:
        match = RATIO_PATTERN.search(str(label or ""))
        if not match:
            return None
        left = Fraction(match.group("w"))
        right = Fraction(match.group("h"))
        if left <= 0 or right <= 0:
            return None

        short_side, long_side = sorted((left, right))
        width_fraction = long_side if orientation == "horizontal" else short_side
        height_fraction = short_side if orientation == "horizontal" else long_side

        common_denominator = math.lcm(width_fraction.denominator, height_fraction.denominator)
        width_units = width_fraction.numerator * (common_denominator // width_fraction.denominator)
        height_units = height_fraction.numerator * (common_denominator // height_fraction.denominator)
        divisor = math.gcd(width_units, height_units)
        return width_units // divisor, height_units // divisor

    def _build_strict_ratio_cover_target(
        self,
        *,
        artwork: Any,
        orientation: str,
        exact_width: int,
        exact_height: int,
    ) -> dict[str, Any] | None:
        ratio_components = self._ratio_components_from_artwork(artwork, orientation=orientation)
        if ratio_components is None:
            return None

        width_units, height_units = ratio_components
        minimum_multiplier = max(
            math.ceil(exact_width / width_units),
            math.ceil(exact_height / height_units),
        )
        minimum_width_px = width_units * minimum_multiplier
        minimum_height_px = height_units * minimum_multiplier

        width_px = minimum_width_px
        height_px = minimum_height_px
        preset_target = self._get_clean_master_ratio_preset(
            width_units=width_units,
            height_units=height_units,
        )
        if preset_target is not None and self._can_cover_target(
            preset_target["width_px"],
            preset_target["height_px"],
            target_width=exact_width,
            target_height=exact_height,
        ):
            width_px = preset_target["width_px"]
            height_px = preset_target["height_px"]

        if width_px == exact_width and height_px == exact_height:
            return None

        return {
            "width_px": width_px,
            "height_px": height_px,
            "ratio_width_units": width_units,
            "ratio_height_units": height_units,
            "ratio_label": f"{width_units}:{height_units}",
            "minimum_cover_width_px": minimum_width_px,
            "minimum_cover_height_px": minimum_height_px,
            "preset_applied": preset_target is not None
            and width_px == preset_target["width_px"]
            and height_px == preset_target["height_px"],
        }

    def _get_clean_master_ratio_preset(
        self,
        *,
        width_units: int,
        height_units: int,
    ) -> dict[str, int] | None:
        if width_units <= 0 or height_units <= 0:
            return None

        short_units, long_units = sorted((width_units, height_units))
        preset = CLEAN_MASTER_RATIO_PRESET_TARGETS.get(f"{short_units}:{long_units}")
        if preset is None:
            return None

        short_edge_px, long_edge_px = preset
        if width_units >= height_units:
            return {
                "width_px": long_edge_px,
                "height_px": short_edge_px,
            }
        return {
            "width_px": short_edge_px,
            "height_px": long_edge_px,
        }

    def _can_cover_target(
        self,
        width: int,
        height: int,
        *,
        target_width: int,
        target_height: int,
    ) -> bool:
        if width <= 0 or height <= 0 or target_width <= 0 or target_height <= 0:
            return False
        return max(target_width / width, target_height / height) <= 1.0000001

    def _estimated_cover_crop_px(
        self,
        width: int,
        height: int,
        *,
        target_width: int,
        target_height: int,
    ) -> dict[str, float]:
        if width <= 0 or height <= 0 or target_width <= 0 or target_height <= 0:
            return {"width_px": 0.0, "height_px": 0.0}
        scale = max(target_width / width, target_height / height)
        scaled_width = width * scale
        scaled_height = height * scale
        return {
            "width_px": round(max(0.0, scaled_width - target_width), 2),
            "height_px": round(max(0.0, scaled_height - target_height), 2),
        }

    def _ratio_delta_px_for_ratio(
        self,
        width: int,
        height: int,
        *,
        artwork_ratio: float,
    ) -> float | None:
        if width <= 0 or height <= 0 or artwork_ratio <= 0:
            return None
        expected_height = width / artwork_ratio
        expected_width = height * artwork_ratio
        return min(abs(height - expected_height), abs(width - expected_width))

    def _candidate_print_area(self, dims: dict[str, Any]) -> int:
        width = int(dims.get("print_area_width_px") or 0)
        height = int(dims.get("print_area_height_px") or 0)
        return width * height

    def _aspect_error_px(
        self,
        width: int,
        height: int,
        target_width: int,
        target_height: int,
    ) -> float | None:
        if width <= 0 or height <= 0 or target_width <= 0 or target_height <= 0:
            return None
        expected_height = width * target_height / target_width
        expected_width = height * target_width / target_height
        return min(abs(height - expected_height), abs(width - expected_width))
