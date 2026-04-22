from __future__ import annotations

import hashlib
import os
import re
from collections import defaultdict
from pathlib import Path
from types import SimpleNamespace
from typing import Any

from PIL import Image
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from src.exeptions import ObjectNotFoundException
from src.models.artworks import ArtworksOrm
from src.print_on_demand import get_print_provider
from src.repositories.prodigi_storefront import ProdigiStorefrontRepository
from src.schemas.artwork_print_assets import ArtworkPrintAssetAdd, ArtworkPrintAssetPatch
from src.services.artwork_print_profiles import ArtworkPrintProfileService
from src.services.prodigi_catalog_preview import (
    DEFAULT_PAPER_MATERIAL,
    ProdigiCatalogPreviewService,
)

SIZE_PATTERN = re.compile(r"(?P<w>\d+(?:\.\d+)?)x(?P<h>\d+(?:\.\d+)?)")

CATEGORY_WORKFLOW_DEFAULTS: dict[str, dict[str, Any]] = {
    "paperPrintRolled": {
        "asset_strategy": "manual_white_border",
        "asset_role": "paper_border_ready",
        "asset_label": "Bordered paper print file",
        "review_label": "Paper composition reviewed",
    },
    "paperPrintBoxFramed": {
        "asset_strategy": "manual_white_border",
        "asset_role": "paper_border_ready",
        "asset_label": "Bordered framed-paper file",
        "review_label": "Framed paper presentation reviewed",
    },
    "canvasRolled": {
        "asset_strategy": "source_master_only",
        "asset_role": None,
        "asset_label": None,
        "review_label": "Rolled canvas reviewed",
    },
    "canvasStretched": {
        "asset_strategy": "manual_wrap_asset",
        "asset_role": "canvas_wrap_ready",
        "asset_label": "Wrap-ready canvas composite",
        "review_label": "Stretched canvas edges reviewed",
    },
    "canvasClassicFrame": {
        "asset_strategy": "manual_wrap_asset",
        "asset_role": "canvas_wrap_ready",
        "asset_label": "Classic-frame canvas composite",
        "review_label": "Classic framed canvas reviewed",
    },
    "canvasFloatingFrame": {
        "asset_strategy": "manual_wrap_asset",
        "asset_role": "canvas_wrap_ready",
        "asset_label": "Floating-frame canvas composite",
        "review_label": "Floating framed canvas reviewed",
    },
}

ASSET_ROLE_RULES: dict[str, dict[str, Any]] = {
    "paper_border_ready": {
        "label": "Bordered print asset",
        "allowed_extensions": {".jpg", ".jpeg", ".png"},
    },
    "canvas_wrap_ready": {
        "label": "Wrap-ready canvas asset",
        "allowed_extensions": {".jpg", ".jpeg", ".png"},
    },
}


class ArtworkPrintWorkflowService:
    """
    Provider-neutral admin workflow/readiness layer for artwork print preparation.

    The service intentionally focuses on structured validation and checklist
    generation instead of storefront rendering. The admin UI can then rely on a
    single payload for:
    - workflow steps,
    - missing provider-facing settings,
    - required prepared assets by category and size,
    - compact readiness summaries for list views.
    """

    def __init__(self, db):
        self.db = db
        self.profile_service = ArtworkPrintProfileService(db)
        self.storefront_repository = ProdigiStorefrontRepository(db.session)

    async def get_workflow(self, artwork_id: int) -> dict[str, Any]:
        artwork = await self._get_artwork_orm(artwork_id)
        assets = await self.db.artwork_print_assets.list_for_artwork(artwork.id)
        bake = await self.storefront_repository.get_active_bake()
        size_catalog, category_defs = await self._build_size_catalog(
            bake=bake,
            ratio_label=artwork.print_aspect_ratio.label if artwork.print_aspect_ratio else None,
        )
        return self._build_workflow_payload(
            artwork=artwork,
            bake=bake,
            size_catalog=size_catalog,
            category_defs=category_defs,
            assets=assets,
        )

    async def build_bulk_readiness_summaries(self, artworks: list[Any]) -> dict[int, dict[str, Any]]:
        if not artworks:
            return {}

        artwork_ids = [int(artwork.id) for artwork in artworks]
        assets = await self.db.artwork_print_assets.list_for_artwork_ids(artwork_ids)
        assets_by_artwork: dict[int, list[Any]] = defaultdict(list)
        for asset in assets:
            assets_by_artwork[int(asset.artwork_id)].append(asset)

        bake = await self.storefront_repository.get_active_bake()
        ratio_labels = sorted(
            {
                artwork.print_aspect_ratio.label
                for artwork in artworks
                if getattr(artwork, "print_aspect_ratio", None)
                and getattr(artwork.print_aspect_ratio, "label", None)
            }
        )
        size_catalog_by_ratio, category_defs_by_ratio = await self._build_bulk_size_catalog(
            bake=bake,
            ratio_labels=ratio_labels,
        )

        summaries: dict[int, dict[str, Any]] = {}
        for artwork in artworks:
            ratio_label = (
                artwork.print_aspect_ratio.label if getattr(artwork, "print_aspect_ratio", None) else None
            )
            payload = self._build_workflow_payload(
                artwork=artwork,
                bake=bake,
                size_catalog=size_catalog_by_ratio.get(ratio_label or "", {}),
                category_defs=category_defs_by_ratio.get(ratio_label or ""),
                assets=assets_by_artwork.get(int(artwork.id), []),
            )
            summaries[int(artwork.id)] = payload["readiness_summary"]
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

    def validate_asset_upload_scope(
        self,
        *,
        asset_role: str,
        file_ext: str,
    ) -> None:
        rule = ASSET_ROLE_RULES.get(asset_role)
        if rule is None:
            raise ValueError(f"Unsupported asset role: {asset_role}")
        if file_ext.lower() not in rule["allowed_extensions"]:
            raise ValueError(
                f"Unsupported extension for {asset_role}. "
                f"Allowed: {', '.join(sorted(rule['allowed_extensions']))}"
            )

    @staticmethod
    def extract_prepared_asset_metadata(
        file_path: str,
        public_url: str | None = None,
    ) -> dict[str, Any]:
        path = Path(file_path)
        with Image.open(path) as img:
            dpi_info = img.info.get("dpi")
            dpi_x = None
            dpi_y = None
            if isinstance(dpi_info, tuple) and len(dpi_info) >= 2:
                dpi_x = round(float(dpi_info[0]), 2)
                dpi_y = round(float(dpi_info[1]), 2)

            width_px, height_px = img.size
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
                "icc_profile_present": bool(img.info.get("icc_profile")),
            }
            return metadata

    @staticmethod
    def compute_sha256(file_path: str) -> str:
        hasher = hashlib.sha256()
        with open(file_path, "rb") as file_obj:
            for chunk in iter(lambda: file_obj.read(1024 * 1024), b""):
                hasher.update(chunk)
        return hasher.hexdigest()

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

    async def _build_size_catalog(
        self,
        *,
        bake: Any | None,
        ratio_label: str | None,
    ) -> tuple[dict[str, dict[str, Any]], list[dict[str, Any]]]:
        category_defs = self._get_category_defs(bake)
        if bake is None or not ratio_label:
            return {}, category_defs

        groups = await self.storefront_repository.get_groups_for_bake_ratios(bake.id, [ratio_label])
        return self._collapse_groups_to_size_catalog(groups), category_defs

    async def _build_bulk_size_catalog(
        self,
        *,
        bake: Any | None,
        ratio_labels: list[str],
    ) -> tuple[dict[str, dict[str, dict[str, Any]]], dict[str, list[dict[str, Any]]]]:
        category_defs = self._get_category_defs(bake)
        category_defs_by_ratio = {ratio: category_defs for ratio in ratio_labels}
        if bake is None or not ratio_labels:
            return {}, category_defs_by_ratio

        groups = await self.storefront_repository.get_groups_for_bake_ratios(bake.id, ratio_labels)
        groups_by_ratio: dict[str, list[Any]] = defaultdict(list)
        for group in groups:
            groups_by_ratio[group.ratio_label].append(group)
        return (
            {
                ratio: self._collapse_groups_to_size_catalog(items)
                for ratio, items in groups_by_ratio.items()
            },
            category_defs_by_ratio,
        )

    def _build_workflow_payload(
        self,
        *,
        artwork: Any,
        bake: Any | None,
        size_catalog: dict[str, dict[str, Any]],
        category_defs: list[dict[str, Any]] | None,
        assets: list[Any],
    ) -> dict[str, Any]:
        category_defs = category_defs or self._get_category_defs(bake)
        profile_bundle = self.profile_service.build_profile_bundle_for_artwork(
            artwork=artwork,
            bake=bake,
            ratio_supported=bool(size_catalog),
        )
        workflow_config = self._merge_workflow_config(artwork.print_workflow_config or {})
        assets_by_scope = self._index_assets(assets)

        print_enabled = self._artwork_has_prints(artwork)
        source_summary = self._build_source_master_summary(artwork, workflow_config, print_enabled)

        category_workflows = []
        for category_def in category_defs:
            category_id = category_def["id"]
            category_workflows.append(
                self._build_category_workflow(
                    artwork=artwork,
                    category_def=category_def,
                    category_sizes=size_catalog.get(category_id, {}),
                    effective_profile=(profile_bundle.get("effective_profiles") or {}).get(category_id, {}),
                    workflow_config=workflow_config["categories"].get(category_id, {}),
                    assets_by_scope=assets_by_scope,
                )
            )

        steps = self._build_steps(
            artwork=artwork,
            print_enabled=print_enabled,
            size_catalog=size_catalog,
            source_summary=source_summary,
            category_workflows=category_workflows,
        )
        readiness_summary = self._build_readiness_summary(steps, category_workflows, source_summary)
        preparation_matrix = self._build_preparation_matrix(
            category_workflows=category_workflows,
            source_summary=source_summary,
        )

        return {
            "artwork_id": int(artwork.id),
            "provider_key": get_print_provider().provider_key,
            "active_bake": {
                "id": bake.id,
                "bake_key": bake.bake_key,
                "paper_material": bake.paper_material,
                "include_notice_level": bake.include_notice_level,
            }
            if bake
            else None,
            "print_enabled": print_enabled,
            "source_master": source_summary,
            "workflow_config": workflow_config,
            "profile_bundle": {
                "print_aspect_ratio": profile_bundle.get("print_aspect_ratio"),
                "source_quality_summary": profile_bundle.get("source_quality_summary"),
            },
            "preparation_matrix": preparation_matrix,
            "category_workflows": category_workflows,
            "steps": steps,
            "assets": [asset.model_dump(mode="json") for asset in assets],
            "readiness_summary": readiness_summary,
        }

    def _build_source_master_summary(
        self,
        artwork: Any,
        workflow_config: dict[str, Any],
        print_enabled: bool,
    ) -> dict[str, Any]:
        source_present = bool(getattr(artwork, "print_quality_url", None))
        source_metadata = getattr(artwork, "print_source_metadata", None) or {}
        issues: list[str] = []
        warnings: list[str] = []

        if print_enabled and not source_present:
            issues.append("Upload a hi-res source master before print preparation can be completed.")
        if source_present and not source_metadata:
            warnings.append("Source master exists, but metadata is missing.")

        reviewed = bool(workflow_config.get("source_master_reviewed"))
        if source_present and not reviewed:
            warnings.append("The source master has not been manually approved yet.")

        status = "ready"
        if issues:
            status = "blocked"
        elif warnings:
            status = "attention"

        return {
            "required": print_enabled,
            "present": source_present,
            "reviewed": reviewed,
            "status": status,
            "issues": issues,
            "warnings": warnings,
            "url": getattr(artwork, "print_quality_url", None),
            "metadata": source_metadata,
        }

    def _build_category_workflow(
        self,
        *,
        artwork: Any,
        category_def: dict[str, Any],
        category_sizes: dict[str, Any],
        effective_profile: dict[str, Any],
        workflow_config: dict[str, Any],
        assets_by_scope: dict[tuple[str | None, str, str | None], Any],
    ) -> dict[str, Any]:
        category_id = category_def["id"]
        defaults = CATEGORY_WORKFLOW_DEFAULTS[category_id]
        strategy = workflow_config.get("asset_strategy") or defaults["asset_strategy"]
        category_enabled = self._is_category_enabled(
            artwork=artwork,
            category_def=category_def,
            workflow_config=workflow_config,
        )
        provider_attributes = dict(workflow_config.get("provider_attributes") or {})
        attribute_choices = self._build_attribute_choices(effective_profile)
        admin_managed_attributes = self._build_admin_managed_attributes(attribute_choices)
        client_selectable_attributes = self._build_client_selectable_attributes(attribute_choices)
        settings_issues = self._validate_provider_attributes(admin_managed_attributes, provider_attributes)

        size_requirements = []
        blocking_count = len(settings_issues)
        ready_count = 0
        required_count = 0

        for slot_size_label, dims in sorted(
            category_sizes.items(),
            key=lambda item: item[1]["short_cm"],
        ):
            requirement = self._build_size_requirement(
                artwork=artwork,
                category_id=category_id,
                slot_size_label=slot_size_label,
                dims=dims,
                strategy=strategy,
                effective_profile=effective_profile,
                assets_by_scope=assets_by_scope,
            )
            size_requirements.append(requirement)
            if requirement["required"]:
                required_count += 1
            if requirement["validation"]["status"] == "ready":
                ready_count += 1
            elif requirement["validation"]["status"] == "blocked":
                blocking_count += 1

        issues = list(settings_issues)
        if category_enabled and defaults["asset_role"] and not category_sizes:
            issues.append("No storefront sizes are currently baked for this category.")
            blocking_count += 1

        reviewed = bool(workflow_config.get("reviewed"))
        if category_enabled and not reviewed:
            issues.append(f"{defaults['review_label']} checkbox is still not confirmed.")
            blocking_count += 1

        status = "ready"
        if blocking_count > 0:
            status = "blocked"
        elif category_enabled and required_count == 0 and defaults["asset_role"]:
            status = "attention"

        return {
            "category_id": category_id,
            "label": category_def["label"],
            "medium": category_def["medium"],
            "material_label": category_def["material_label"],
            "frame_label": category_def["frame_label"],
            "enabled": category_enabled,
            "offered_in_active_bake": bool(category_sizes),
            "asset_strategy": strategy,
            "reviewed": reviewed,
            "provider_attributes": provider_attributes,
            "attribute_choices": attribute_choices,
            "admin_managed_attributes": admin_managed_attributes,
            "client_selectable_attributes": client_selectable_attributes,
            "provider_submission_defaults": self._build_provider_submission_defaults(
                admin_managed_attributes,
                provider_attributes,
            ),
            "effective_profile": effective_profile,
            "issues": issues,
            "size_requirements": size_requirements,
            "summary": {
                "required_count": required_count,
                "ready_count": ready_count,
                "blocking_count": blocking_count,
                "status": status,
            },
        }

    def _build_size_requirement(
        self,
        *,
        artwork: Any,
        category_id: str,
        slot_size_label: str,
        dims: dict[str, Any],
        strategy: str,
        effective_profile: dict[str, Any],
        assets_by_scope: dict[tuple[str | None, str, str | None], Any],
    ) -> dict[str, Any]:
        defaults = CATEGORY_WORKFLOW_DEFAULTS[category_id]
        asset_role = defaults["asset_role"]
        required = bool(asset_role) and strategy in {"manual_white_border", "manual_wrap_asset"}

        base_target_dpi = int(effective_profile.get("target_dpi") or 300)
        wrap_margin_pct = float(effective_profile.get("wrap_margin_pct") or 0.0)
        width_cm, height_cm = self._orient_size_for_artwork(artwork, dims["short_cm"], dims["long_cm"])
        target_dpi = self._resolve_target_dpi(
            category_id=category_id,
            width_cm=width_cm,
            height_cm=height_cm,
            base_target_dpi=base_target_dpi,
        )
        multiplier = 1.0
        if strategy == "manual_wrap_asset":
            multiplier += (wrap_margin_pct / 100.0) * 2.0

        required_width_px = round((width_cm / 2.54) * target_dpi * multiplier)
        required_height_px = round((height_cm / 2.54) * target_dpi * multiplier)

        asset = None
        asset_source = "missing"
        if asset_role:
            exact_asset = assets_by_scope.get((category_id, asset_role, slot_size_label))
            shared_asset = assets_by_scope.get((category_id, asset_role, None))
            if exact_asset is not None:
                asset = exact_asset
                asset_source = "exact"
            elif shared_asset is not None:
                asset = shared_asset
                asset_source = "category_master"

        validation = self._validate_size_asset(
            asset=asset,
            required=required,
            asset_role=asset_role,
            required_width_px=required_width_px,
            required_height_px=required_height_px,
        )

        return {
            "slot_size_label": slot_size_label,
            "physical_size_cm": {"width": width_cm, "height": height_cm},
            "required": required,
            "asset_role": asset_role,
            "asset_role_label": defaults["asset_label"],
            "strategy": strategy,
            "target_dpi": target_dpi,
            "base_target_dpi": base_target_dpi,
            "dpi_policy_note": self._build_dpi_policy_note(
                category_id=category_id,
                width_cm=width_cm,
                height_cm=height_cm,
                target_dpi=target_dpi,
                base_target_dpi=base_target_dpi,
            ),
            "wrap_margin_pct": wrap_margin_pct,
            "required_dimensions_px": {
                "width": required_width_px,
                "height": required_height_px,
            },
            "asset_source": asset_source,
            "asset": asset.model_dump(mode="json") if asset else None,
            "validation": validation,
        }

    def _validate_size_asset(
        self,
        *,
        asset: Any | None,
        required: bool,
        asset_role: str | None,
        required_width_px: int,
        required_height_px: int,
    ) -> dict[str, Any]:
        issues: list[str] = []
        warnings: list[str] = []

        if not required:
            return {
                "status": "not_required",
                "issues": issues,
                "warnings": warnings,
            }

        if asset is None:
            issues.append("Required prepared asset is missing.")
            return {
                "status": "blocked",
                "issues": issues,
                "warnings": warnings,
            }

        metadata = asset.file_metadata or {}
        width_px = metadata.get("width_px")
        height_px = metadata.get("height_px")
        file_ext = (asset.file_ext or "").lower()
        rule = ASSET_ROLE_RULES.get(asset_role or "")
        if rule and file_ext not in rule["allowed_extensions"]:
            issues.append(
                f"Unexpected file extension {file_ext or '(missing)'}. "
                f"Allowed: {', '.join(sorted(rule['allowed_extensions']))}"
            )

        if not width_px or not height_px:
            issues.append("Prepared asset metadata is incomplete, so size validation cannot run.")
        else:
            if int(width_px) < required_width_px or int(height_px) < required_height_px:
                issues.append(
                    "Prepared asset is undersized for the configured DPI and print geometry."
                )

        status = "ready" if not issues else "blocked"
        return {
            "status": status,
            "issues": issues,
            "warnings": warnings,
        }

    def _build_steps(
        self,
        *,
        artwork: Any,
        print_enabled: bool,
        size_catalog: dict[str, dict[str, Any]],
        source_summary: dict[str, Any],
        category_workflows: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        basics_issues: list[str] = []
        if not getattr(artwork, "title", "").strip():
            basics_issues.append("Title is missing.")
        if print_enabled and not getattr(artwork, "print_aspect_ratio", None):
            basics_issues.append("Assign a print aspect ratio before preparing print variants.")

        basics_status = "ready" if not basics_issues else "blocked"
        if print_enabled and getattr(artwork, "print_aspect_ratio", None) and not size_catalog:
            basics_status = "attention"
            basics_issues.append("The active bake does not currently expose sizes for this ratio.")

        category_blockers = sum(
            1 for item in category_workflows if item["enabled"] and item["summary"]["status"] == "blocked"
        )
        preparation_status = "ready"
        preparation_issues: list[str] = []
        if category_blockers:
            preparation_status = "blocked"
            preparation_issues.append(f"{category_blockers} print category workflows are incomplete.")
        elif print_enabled and not any(item["enabled"] for item in category_workflows):
            preparation_status = "attention"
            preparation_issues.append("No sellable print categories are currently enabled.")

        return [
            {
                "id": "artwork_basics",
                "label": "Artwork Basics",
                "status": basics_status,
                "issues": basics_issues,
            },
            {
                "id": "source_master",
                "label": "Source Master",
                "status": source_summary["status"],
                "issues": list(source_summary["issues"]),
                "warnings": list(source_summary["warnings"]),
            },
            {
                "id": "print_preparation",
                "label": "Print Preparation",
                "status": preparation_status,
                "issues": preparation_issues,
            },
        ]

    def _build_readiness_summary(
        self,
        steps: list[dict[str, Any]],
        category_workflows: list[dict[str, Any]],
        source_summary: dict[str, Any],
    ) -> dict[str, Any]:
        blocking_steps = [step for step in steps if step["status"] == "blocked"]
        attention_steps = [step for step in steps if step["status"] == "attention"]
        blocking_categories = [
            item for item in category_workflows if item["enabled"] and item["summary"]["status"] == "blocked"
        ]
        ready_categories = [
            item for item in category_workflows if item["enabled"] and item["summary"]["status"] == "ready"
        ]

        status = "ready"
        if blocking_steps or blocking_categories:
            status = "blocked"
        elif attention_steps or source_summary["status"] == "attention":
            status = "attention"

        return {
            "status": status,
            "step_count": len(steps),
            "blocking_step_count": len(blocking_steps),
            "attention_step_count": len(attention_steps),
            "enabled_category_count": sum(1 for item in category_workflows if item["enabled"]),
            "ready_category_count": len(ready_categories),
            "blocking_category_count": len(blocking_categories),
            "source_master_present": source_summary["present"],
            "source_master_reviewed": source_summary["reviewed"],
            "highlight_variant": (
                "danger" if status == "blocked" else "warning" if status == "attention" else "success"
            ),
            "message": (
                "Print workflow is ready."
                if status == "ready"
                else "Artwork still has blocking print-prep gaps."
                if status == "blocked"
                else "Artwork is usable, but still needs manual print-prep attention."
            ),
        }

    def _build_preparation_matrix(
        self,
        *,
        category_workflows: list[dict[str, Any]],
        source_summary: dict[str, Any],
    ) -> list[dict[str, Any]]:
        matrix: list[dict[str, Any]] = []
        for category in category_workflows:
            size_requirements = list(category.get("size_requirements") or [])
            manual_requirements = [
                requirement for requirement in size_requirements if requirement.get("required")
            ]
            anchor_requirement = None
            if manual_requirements:
                anchor_requirement = max(
                    manual_requirements,
                    key=lambda item: (
                        int(item["required_dimensions_px"]["width"]),
                        int(item["required_dimensions_px"]["height"]),
                    ),
                )

            matrix.append(
                {
                    "category_id": category["category_id"],
                    "label": category["label"],
                    "enabled": category["enabled"],
                    "status": category["summary"]["status"],
                    "asset_strategy": category["asset_strategy"],
                    "uses_source_master_only": category["asset_strategy"] == "source_master_only",
                    "category_master_supported": bool(anchor_requirement),
                    "required_asset_role": anchor_requirement.get("asset_role")
                    if anchor_requirement
                    else None,
                    "required_asset_label": anchor_requirement.get("asset_role_label")
                    if anchor_requirement
                    else None,
                    "suggested_master_size_label": anchor_requirement.get("slot_size_label")
                    if anchor_requirement
                    else None,
                    "suggested_master_target_dpi": anchor_requirement.get("target_dpi")
                    if anchor_requirement
                    else None,
                    "suggested_master_dpi_policy_note": anchor_requirement.get("dpi_policy_note")
                    if anchor_requirement
                    else None,
                    "minimum_master_dimensions_px": anchor_requirement.get("required_dimensions_px")
                    if anchor_requirement
                    else None,
                    "covered_size_count": len(manual_requirements) if manual_requirements else 0,
                    "source_master_present": source_summary["present"],
                    "source_master_reviewed": source_summary["reviewed"],
                    "client_selectable_attributes": list(
                        category.get("client_selectable_attributes") or []
                    ),
                    "provider_submission_defaults": dict(
                        category.get("provider_submission_defaults") or {}
                    ),
                }
            )
        return matrix

    def _collapse_groups_to_size_catalog(self, groups: list[Any]) -> dict[str, dict[str, Any]]:
        catalog: dict[str, dict[str, Any]] = defaultdict(dict)
        for group in groups:
            for size in group.sizes:
                slot_size_label = size.slot_size_label
                if not slot_size_label:
                    continue
                dims = self._parse_size_label(slot_size_label)
                if dims is None:
                    continue
                existing = catalog[group.category_id].get(slot_size_label)
                candidate = {
                    "short_cm": dims["short_cm"],
                    "long_cm": dims["long_cm"],
                    "available": bool(size.available),
                }
                if existing is None or (not existing["available"] and candidate["available"]):
                    catalog[group.category_id][slot_size_label] = candidate
        return {category_id: dict(items) for category_id, items in catalog.items()}

    def _merge_workflow_config(self, existing: dict[str, Any]) -> dict[str, Any]:
        categories = {}
        existing_categories = existing.get("categories") if isinstance(existing, dict) else {}
        if not isinstance(existing_categories, dict):
            existing_categories = {}

        for category_id, defaults in CATEGORY_WORKFLOW_DEFAULTS.items():
            category_existing = existing_categories.get(category_id)
            if not isinstance(category_existing, dict):
                category_existing = {}
            categories[category_id] = {
                "enabled": category_existing.get("enabled"),
                "reviewed": bool(category_existing.get("reviewed")),
                "asset_strategy": category_existing.get("asset_strategy", defaults["asset_strategy"]),
                "provider_attributes": dict(category_existing.get("provider_attributes") or {}),
                "notes": category_existing.get("notes", ""),
            }

        return {
            "source_master_reviewed": bool(existing.get("source_master_reviewed"))
            if isinstance(existing, dict)
            else False,
            "categories": categories,
        }

    def _build_attribute_choices(self, effective_profile: dict[str, Any]) -> list[dict[str, Any]]:
        fixed_attributes = dict(effective_profile.get("fixed_attributes") or {})
        recommended_defaults = dict(effective_profile.get("recommended_defaults") or {})
        allowed_attributes = dict(effective_profile.get("allowed_attributes") or {})

        choices: list[dict[str, Any]] = []
        for key, value in fixed_attributes.items():
            choices.append(
                {
                    "key": key,
                    "mode": "fixed",
                    "value": value,
                    "options": [value],
                    "default_value": value,
                }
            )

        for key, options in allowed_attributes.items():
            if key in fixed_attributes:
                continue
            choices.append(
                {
                    "key": key,
                    "mode": "select",
                    "value": None,
                    "options": list(options),
                    "default_value": recommended_defaults.get(key),
                }
            )

        for key, value in recommended_defaults.items():
            if key in fixed_attributes or key in allowed_attributes:
                continue
            choices.append(
                {
                    "key": key,
                    "mode": "default",
                    "value": value,
                    "options": [value],
                    "default_value": value,
                }
            )
        return choices

    def _build_admin_managed_attributes(
        self,
        attribute_choices: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        return [choice for choice in attribute_choices if choice["mode"] in {"fixed", "default"}]

    def _build_client_selectable_attributes(
        self,
        attribute_choices: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        return [choice for choice in attribute_choices if choice["mode"] == "select"]

    def _build_provider_submission_defaults(
        self,
        attribute_choices: list[dict[str, Any]],
        provider_attributes: dict[str, Any],
    ) -> dict[str, Any]:
        defaults: dict[str, Any] = {}
        for choice in attribute_choices:
            resolved_value = provider_attributes.get(choice["key"])
            if not resolved_value:
                resolved_value = choice.get("value") or choice.get("default_value")
            if resolved_value:
                defaults[choice["key"]] = resolved_value
        return defaults

    def _resolve_target_dpi(
        self,
        *,
        category_id: str,
        width_cm: float,
        height_cm: float,
        base_target_dpi: int,
    ) -> int:
        return base_target_dpi

    def _build_dpi_policy_note(
        self,
        *,
        category_id: str,
        width_cm: float,
        height_cm: float,
        target_dpi: int,
        base_target_dpi: int,
    ) -> str:
        long_edge_cm = round(max(width_cm, height_cm), 1)
        return f"Target remains {target_dpi} DPI for this size ({long_edge_cm} cm long edge)."

    def _validate_provider_attributes(
        self,
        attribute_choices: list[dict[str, Any]],
        provider_attributes: dict[str, Any],
    ) -> list[str]:
        issues: list[str] = []
        for choice in attribute_choices:
            selected_value = provider_attributes.get(choice["key"]) or choice.get("default_value")
            if not selected_value:
                issues.append(f"Choose a value for {choice['key']}.")
        return issues

    def _index_assets(self, assets: list[Any]) -> dict[tuple[str | None, str, str | None], Any]:
        return {
            (asset.category_id, asset.asset_role, asset.slot_size_label): asset for asset in assets
        }

    def _is_category_enabled(
        self,
        *,
        artwork: Any,
        category_def: dict[str, Any],
        workflow_config: dict[str, Any],
    ) -> bool:
        medium = category_def["medium"]
        if medium == "paper":
            medium_enabled = bool(
                getattr(artwork, "has_paper_print", False)
                or getattr(artwork, "has_paper_print_limited", False)
            )
        else:
            medium_enabled = bool(
                getattr(artwork, "has_canvas_print", False)
                or getattr(artwork, "has_canvas_print_limited", False)
            )

        explicit_enabled = workflow_config.get("enabled")
        if explicit_enabled is None:
            return medium_enabled
        return bool(explicit_enabled) and medium_enabled

    def _orient_size_for_artwork(
        self,
        artwork: Any,
        short_cm: float,
        long_cm: float,
    ) -> tuple[float, float]:
        orientation = str(getattr(artwork, "orientation", "") or "").lower()
        if orientation == "horizontal":
            return long_cm, short_cm
        return short_cm, long_cm

    def _artwork_has_prints(self, artwork: Any) -> bool:
        return bool(
            getattr(artwork, "has_paper_print", False)
            or getattr(artwork, "has_paper_print_limited", False)
            or getattr(artwork, "has_canvas_print", False)
            or getattr(artwork, "has_canvas_print_limited", False)
        )

    def _parse_size_label(self, size_label: str) -> dict[str, float] | None:
        normalized = size_label.lower().replace("×", "x").strip()
        match = SIZE_PATTERN.search(normalized)
        if not match:
            return None
        first = round(float(match.group("w")), 1)
        second = round(float(match.group("h")), 1)
        short_cm, long_cm = sorted((first, second))
        return {"short_cm": short_cm, "long_cm": long_cm}

    def _get_category_defs(self, bake: Any | None) -> list[dict[str, Any]]:
        paper_material = bake.paper_material if bake else DEFAULT_PAPER_MATERIAL
        return ProdigiCatalogPreviewService(SimpleNamespace(session=None)).get_category_defs(
            paper_material
        )

    async def generate_category_derivatives_from_master(
        self,
        *,
        artwork_id: int,
        category_id: str,
        asset_role: str,
    ) -> list[Any]:
        artwork = await self._get_artwork_orm(artwork_id)
        assets = await self.db.artwork_print_assets.list_for_artwork(artwork_id)
        master_asset = next(
            (
                asset
                for asset in assets
                if asset.category_id == category_id
                and asset.asset_role == asset_role
                and asset.slot_size_label is None
            ),
            None,
        )
        if master_asset is None:
            return []

        master_path = str(master_asset.file_url or "").lstrip("/")
        if not master_path or not os.path.exists(master_path):
            return []

        master_metadata = master_asset.file_metadata or {}
        master_width_px = int(master_metadata.get("width_px") or 0)
        master_height_px = int(master_metadata.get("height_px") or 0)
        if master_width_px <= 0 or master_height_px <= 0:
            return []

        bake = await self.storefront_repository.get_active_bake()
        size_catalog, _ = await self._build_size_catalog(
            bake=bake,
            ratio_label=artwork.print_aspect_ratio.label if artwork.print_aspect_ratio else None,
        )
        profile_bundle = self.profile_service.build_profile_bundle_for_artwork(
            artwork=artwork,
            bake=bake,
            ratio_supported=bool(size_catalog),
        )
        workflow_config = self._merge_workflow_config(artwork.print_workflow_config or {})
        category_config = workflow_config["categories"].get(category_id, {})
        strategy = category_config.get("asset_strategy") or CATEGORY_WORKFLOW_DEFAULTS[category_id][
            "asset_strategy"
        ]
        effective_profile = (profile_bundle.get("effective_profiles") or {}).get(category_id, {})

        out_dir = os.path.join(
            "static",
            "print-prep",
            str(artwork_id),
            self._sanitize_path_fragment(category_id, "shared"),
            self._sanitize_path_fragment(asset_role, "asset"),
            "derived",
        )
        os.makedirs(out_dir, exist_ok=True)

        ext = ".png"
        save_format = "PNG"
        generated_assets: list[Any] = []

        with Image.open(master_path) as source_img:
            icc_profile = source_img.info.get("icc_profile")
            for slot_size_label, dims in sorted(
                size_catalog.get(category_id, {}).items(),
                key=lambda item: item[1]["short_cm"],
            ):
                requirement = self._build_size_requirement(
                    artwork=artwork,
                    category_id=category_id,
                    slot_size_label=slot_size_label,
                    dims=dims,
                    strategy=strategy,
                    effective_profile=effective_profile,
                    assets_by_scope={},
                )
                if not requirement["required"]:
                    continue

                target_width = int(requirement["required_dimensions_px"]["width"])
                target_height = int(requirement["required_dimensions_px"]["height"])
                if target_width > master_width_px or target_height > master_height_px:
                    continue

                safe_slot = self._sanitize_path_fragment(slot_size_label, "variant")
                filename = f"{safe_slot}_{master_asset.id}.png"
                dest_path = os.path.join(out_dir, filename)

                existing = await self.db.artwork_print_assets.get_one_or_none(
                    artwork_id=artwork_id,
                    provider_key=get_print_provider().provider_key,
                    category_id=category_id,
                    asset_role=asset_role,
                    slot_size_label=slot_size_label,
                )
                if existing and existing.file_url:
                    existing_path = str(existing.file_url).lstrip("/")
                    if existing_path and os.path.exists(existing_path):
                        os.remove(existing_path)

                resized = source_img.resize((target_width, target_height), Image.Resampling.LANCZOS)
                save_kwargs: dict[str, Any] = {}
                if icc_profile:
                    save_kwargs["icc_profile"] = icc_profile
                if resized.mode not in {"RGB", "RGBA", "L"}:
                    resized = resized.convert("RGBA" if "A" in resized.getbands() else "RGB")
                resized.save(dest_path, format=save_format, **save_kwargs)

                public_url = "/" + dest_path.replace("\\", "/")
                metadata = self.extract_prepared_asset_metadata(dest_path, public_url=public_url)
                metadata.update(
                    {
                        "generated_from_asset_id": master_asset.id,
                        "generated_from_slot_size_label": None,
                        "derivative": True,
                    }
                )
                stored = await self.upsert_prepared_asset(
                    artwork_id=artwork_id,
                    provider_key=get_print_provider().provider_key,
                    category_id=category_id,
                    asset_role=asset_role,
                    slot_size_label=slot_size_label,
                    file_url=public_url,
                    file_name=filename,
                    file_ext=".png",
                    mime_type="image/png",
                    file_size_bytes=metadata.get("file_size_bytes"),
                    checksum_sha256=self.compute_sha256(dest_path),
                    file_metadata=metadata,
                    note="Auto-generated from category master",
                )
                generated_assets.append(stored)

        return generated_assets

    async def delete_generated_assets_for_master(self, master_asset: Any) -> None:
        assets = await self.db.artwork_print_assets.list_for_artwork(int(master_asset.artwork_id))
        generated_assets = [
            asset
            for asset in assets
            if asset.category_id == master_asset.category_id
            and asset.asset_role == master_asset.asset_role
            and asset.slot_size_label is not None
            and isinstance(asset.file_metadata, dict)
            and asset.file_metadata.get("generated_from_asset_id") == master_asset.id
        ]
        for asset in generated_assets:
            await self.db.artwork_print_assets.delete_one(asset.id)
            file_path = str(asset.file_url or "").lstrip("/")
            if file_path and os.path.exists(file_path):
                os.remove(file_path)

    def _sanitize_path_fragment(self, value: str | None, fallback: str) -> str:
        raw = (value or "").strip()
        sanitized = re.sub(r"[^a-zA-Z0-9._-]+", "-", raw).strip("-_.")
        return sanitized or fallback
