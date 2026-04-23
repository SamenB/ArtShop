"""
Print pipeline workflow built around 2 production master slots.

The admin uploads at most 2 files per artwork:
1. paper_bordered
2. clean_master

Smaller baked variants are generated automatically from those masters.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
from collections import defaultdict
from pathlib import Path
from typing import Any

from PIL import Image, ImageOps
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from src.exeptions import ObjectNotFoundException
from src.models.artworks import ArtworksOrm
from src.print_on_demand import get_print_provider
from src.repositories.prodigi_storefront import ProdigiStorefrontRepository

SIZE_PATTERN = re.compile(r"(?P<w>\d+(?:\.\d+)?)x(?P<h>\d+(?:\.\d+)?)")
RATIO_PATTERN = re.compile(r"(?P<w>\d+(?:\.\d+)?)[x:](?P<h>\d+(?:\.\d+)?)")
TARGET_DPI = 300
WRAPPED_CANVAS_CATEGORIES = {
    "canvasStretched",
    "canvasClassicFrame",
    "canvasFloatingFrame",
}

MASTER_SLOTS: dict[str, dict[str, Any]] = {
    "paper_bordered": {
        "label": "Paper Bordered Master",
        "asset_role": "paper_border_ready",
        "description": "Artwork with white borders for rolled paper prints.",
        "covers_categories": ["paperPrintRolled"],
        "derives_categories": [],
        "wrap_margin_pct": 0.0,
    },
    "clean_master": {
        "label": "Clean Production Master",
        "asset_role": "clean_master",
        "description": "Clean edge-to-edge artwork for framed paper and all canvas products.",
        "covers_categories": [
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
    "paper_border_ready": {
        "label": "Bordered print asset",
        "allowed_extensions": {".jpg", ".jpeg", ".png"},
    },
    "clean_master": {
        "label": "Clean production asset",
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
        size_catalog, provider_attribute_coverage = await self._build_size_catalog_with_provider_coverage(
            bake=bake,
            ratio_label=ratio_label,
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
                provider_attribute_coverage=provider_attribute_coverage,
            )
            for slot_id, slot_def in MASTER_SLOTS.items()
        ]
        overall_status = self._compute_overall_status(slots, print_enabled)

        return {
            "artwork_id": int(artwork.id),
            "provider_key": get_print_provider().provider_key,
            "print_enabled": print_enabled,
            "active_bake": {
                "id": bake.id,
                "bake_key": bake.bake_key,
            }
            if bake
            else None,
            "master_slots": slots,
            "overall_status": overall_status,
            "readiness_summary": self._build_readiness_summary(slots, overall_status),
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
            size_catalog = size_catalogs.get(ratio_label or "", {})
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
                provider_attribute_coverage={},
            )
            for slot_id, slot_def in MASTER_SLOTS.items()
        ]
            overall_status = self._compute_overall_status(slots, print_enabled)
            summaries[int(artwork.id)] = self._build_readiness_summary(slots, overall_status)

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
        orientation = str(getattr(artwork, "orientation", "") or "").lower()

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
        provider_attribute_coverage: dict[str, Any],
    ) -> dict[str, Any]:
        asset_role = slot_def["asset_role"]
        covers = list(slot_def["covers_categories"])
        derives = list(slot_def.get("derives_categories", []))
        slot_categories = covers + derives
        slot_relevant = (
            print_enabled
            and self._slot_has_active_categories(artwork, slot_categories)
            and self._slot_has_available_sizes(slot_categories, size_catalog)
        )
        largest_size = self._find_largest_size(
            covers=covers,
            size_catalog=size_catalog,
            orientation=orientation,
            wrap_margin_pct=float(slot_def.get("wrap_margin_pct", 0.0)),
        )

        uploaded_asset = master_assets.get(asset_role)
        asset_metadata = (uploaded_asset.file_metadata or {}) if uploaded_asset else {}
        issues: list[str] = []
        warnings: list[str] = []

        if slot_relevant and uploaded_asset is None:
            issues.append("Upload the production master for this slot.")

        if slot_relevant and uploaded_asset is not None and largest_size:
            uploaded_w = int(asset_metadata.get("width_px") or 0)
            uploaded_h = int(asset_metadata.get("height_px") or 0)
            required_w = largest_size["required_width_px"]
            required_h = largest_size["required_height_px"]
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

        if slot_relevant and largest_size is None:
            warnings.append(
                "No baked storefront sizes were found for this artwork ratio yet."
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
            }
            if largest_size
            else None,
            "required_min_px_source": largest_size["print_area_source"] if largest_size else None,
            "export_guidance": self._build_export_guidance(
                slot_id=slot_id,
                artwork=artwork,
                orientation=orientation,
                largest_size=largest_size,
            ),
            "derivative_plan": self._build_derivative_plan(
                slot_id=slot_id,
                covers=covers,
                derives=derives,
                size_catalog=size_catalog,
                orientation=orientation,
                wrap_margin_pct=float(slot_def.get("wrap_margin_pct", 0.0)),
                largest_size=largest_size,
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

        if slot_id == "clean_master":
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

    def _find_slot_by_asset_role(self, asset_role: str) -> tuple[str, dict[str, Any]]:
        for slot_id, slot_def in MASTER_SLOTS.items():
            if slot_def["asset_role"] == asset_role:
                return slot_id, slot_def
        raise ValueError(f"Unsupported asset role: {asset_role}")

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

        if slot_id == "clean_master":
            direct_count = target_count
            recompose_count = 0
            strategy = "exact_lanczos_resize"
            note = (
                "The clean master is resized directly to each provider target artboard. "
                "This preserves the whole image and avoids white strips; minor provider "
                "ratio drift is absorbed by the final exact resize."
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

    def _build_readiness_summary(self, slots: list[dict[str, Any]], overall_status: str) -> dict[str, Any]:
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
            asset_role = "clean_master" if asset.asset_role in {"paper_clean", "canvas_clean"} else asset.asset_role
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
        dimensions = getattr(size, "print_area_dimensions", None) or {}
        if isinstance(dimensions, str):
            try:
                dimensions = json.loads(dimensions)
            except json.JSONDecodeError:
                return {}
        if not isinstance(dimensions, dict):
            return {}
        attributes = dimensions.get("variant_attributes") or {}
        return dict(attributes) if isinstance(attributes, dict) else {}

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
