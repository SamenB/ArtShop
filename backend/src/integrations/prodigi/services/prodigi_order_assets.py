from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from PIL import Image, ImageOps
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from src.config import settings
from src.integrations.prodigi.repositories.prodigi_storefront import ProdigiStorefrontRepository
from src.integrations.prodigi.services.prodigi_print_area_resolver import ProdigiPrintAreaResolver
from src.models.artwork_print_assets import ArtworkPrintAssetOrm
from src.models.artworks import ArtworksOrm
from src.models.prodigi_storefront import (
    ProdigiStorefrontOfferGroupOrm,
    ProdigiStorefrontOfferSizeOrm,
)

Image.MAX_IMAGE_PIXELS = None

# Paper categories where white borders are applied programmatically
PAPER_CATEGORIES = {
    "paperPrintRolled",
    "paperPrintBoxFramed",
    "paperPrintClassicFramed",
}

# Unified master role — all categories use the same master asset.
# Legacy roles are checked as fallbacks for existing uploads.
PREPARED_ASSET_ROLE_BY_CATEGORY = {
    "paperPrintRolled": "master",
    "paperPrintBoxFramed": "master",
    "paperPrintClassicFramed": "master",
    "canvasRolled": "master",
    "canvasStretched": "master",
    "canvasClassicFrame": "master",
    "canvasFloatingFrame": "master",
}

# Legacy asset roles to try when no "master" asset is found
_LEGACY_FALLBACK_ROLES = {
    "paperPrintRolled": ["paper_border_ready", "clean_master"],
    "paperPrintBoxFramed": ["clean_master"],
    "paperPrintClassicFramed": ["clean_master"],
    "canvasRolled": ["clean_master"],
    "canvasStretched": ["clean_master"],
    "canvasClassicFrame": ["clean_master"],
    "canvasFloatingFrame": ["clean_master"],
}


class ProdigiOrderAssetService:
    def __init__(self, db_session):
        self.db_session = db_session
        self.storefront_repository = ProdigiStorefrontRepository(db_session)

    async def prepare_order_asset(
        self,
        *,
        order_id: int,
        order_item_id: int,
        artwork_id: int,
        category_id: str,
        slot_size_label: str,
        sku: str | None,
        country_code: str | None,
        attributes: dict[str, Any] | None = None,
    ) -> dict[str, Any] | None:
        master_asset = await self.resolve_master_asset(
            artwork_id=artwork_id,
            category_id=category_id,
        )
        if master_asset is None:
            return None

        target = await self.resolve_target_size(
            category_id=category_id,
            slot_size_label=slot_size_label,
            sku=sku,
            country_code=country_code,
        )
        if target is None:
            return None
        target = await self.verify_target_size_with_prodigi_api(
            target=target,
            category_id=category_id,
            sku=sku,
            country_code=country_code,
            attributes=attributes,
        )
        if target is None:
            return None

        # Fetch white_border_pct from the artwork for paper categories
        white_border_pct = 0.0
        if category_id in PAPER_CATEGORIES:
            white_border_pct = await self._get_artwork_border_pct(artwork_id)

        rendered = self.render_from_master(
            master_asset=master_asset,
            category_id=category_id,
            slot_size_label=slot_size_label,
            target_width=int(target["width_px"]),
            target_height=int(target["height_px"]),
            output_dir=Path("static")
            / "print-orders"
            / str(order_id)
            / str(order_item_id),
            white_border_pct=white_border_pct,
        )
        rendered["print_area_name"] = target.get("print_area_name") or "default"
        rendered["print_area_source"] = target.get("print_area_source")
        rendered["prodigi_verified"] = bool(target.get("prodigi_verified"))
        return rendered

    async def _get_artwork_border_pct(self, artwork_id: int) -> float:
        """Fetch white_border_pct from the artwork record (default 5.0)."""
        result = await self.db_session.execute(
            select(ArtworksOrm.white_border_pct).where(ArtworksOrm.id == artwork_id)
        )
        value = result.scalar_one_or_none()
        return float(value) if value is not None else 5.0

    async def resolve_master_asset(
        self,
        *,
        artwork_id: int,
        category_id: str,
    ) -> ArtworkPrintAssetOrm | None:
        # Try the unified "master" role first
        asset_role = PREPARED_ASSET_ROLE_BY_CATEGORY.get(category_id)
        if asset_role is None:
            return None

        asset = await self._find_asset_by_role(artwork_id, asset_role)
        if asset is not None:
            return asset

        # Fallback to legacy roles for existing uploads
        legacy_roles = _LEGACY_FALLBACK_ROLES.get(category_id, [])
        for legacy_role in legacy_roles:
            asset = await self._find_asset_by_role(artwork_id, legacy_role)
            if asset is not None:
                return asset

        return None

    async def _find_asset_by_role(
        self, artwork_id: int, asset_role: str
    ) -> ArtworkPrintAssetOrm | None:
        query = (
            select(ArtworkPrintAssetOrm)
            .where(
                ArtworkPrintAssetOrm.artwork_id == artwork_id,
                ArtworkPrintAssetOrm.provider_key == "prodigi",
                ArtworkPrintAssetOrm.asset_role == asset_role,
                ArtworkPrintAssetOrm.slot_size_label.is_(None),
            )
            .order_by(ArtworkPrintAssetOrm.id.desc())
            .limit(1)
        )
        result = await self.db_session.execute(query)
        return result.scalar_one_or_none()

    async def resolve_target_size(
        self,
        *,
        category_id: str,
        slot_size_label: str,
        sku: str | None,
        country_code: str | None,
    ) -> dict[str, Any] | None:
        active_bake = await self.storefront_repository.get_active_bake()
        if active_bake is None:
            return None

        query = (
            select(ProdigiStorefrontOfferSizeOrm)
            .join(ProdigiStorefrontOfferSizeOrm.offer_group)
            .where(
                ProdigiStorefrontOfferGroupOrm.bake_id == active_bake.id,
                ProdigiStorefrontOfferGroupOrm.category_id == category_id,
                ProdigiStorefrontOfferSizeOrm.slot_size_label == slot_size_label,
                ProdigiStorefrontOfferSizeOrm.available.is_(True),
            )
            .options(selectinload(ProdigiStorefrontOfferSizeOrm.offer_group))
            .order_by(ProdigiStorefrontOfferSizeOrm.id.desc())
        )
        normalized_country = (country_code or "").upper()
        if normalized_country:
            query = query.where(
                ProdigiStorefrontOfferGroupOrm.destination_country == normalized_country
            )
        if sku:
            result = await self.db_session.execute(
                query.where(ProdigiStorefrontOfferSizeOrm.sku == sku).limit(1)
            )
            size = result.scalar_one_or_none()
            if size is None:
                result = await self.db_session.execute(query.limit(1))
                size = result.scalar_one_or_none()
        else:
            result = await self.db_session.execute(query.limit(1))
            size = result.scalar_one_or_none()
        if size is None or not size.print_area_width_px or not size.print_area_height_px:
            return None

        return {
            "width_px": int(size.print_area_width_px),
            "height_px": int(size.print_area_height_px),
            "print_area_name": size.print_area_name or "default",
            "print_area_source": size.print_area_source,
            "print_area_dimensions": size.print_area_dimensions,
            "supplier_size_inches": size.supplier_size_inches,
            "supplier_size_cm": size.supplier_size_cm,
            "sku": size.sku,
            "slot_size_label": size.slot_size_label,
            "product_price": float(size.product_price) if size.product_price is not None else None,
            "shipping_price": float(size.shipping_price) if size.shipping_price is not None else None,
        }

    async def verify_target_size_with_prodigi_api(
        self,
        *,
        target: dict[str, Any],
        category_id: str,
        sku: str | None,
        country_code: str | None,
        attributes: dict[str, Any] | None,
    ) -> dict[str, Any] | None:
        """
        Re-read the exact print target from Prodigi before order rendering.

        The baked storefront remains the fast read model, but this final check
        prevents a stale bake or CSV fallback from silently producing a file
        whose dimensions no longer match Prodigi's current product contract.
        """
        if not settings.PRODIGI_API_KEY:
            return {**target, "prodigi_verified": False}

        async with ProdigiPrintAreaResolver() as resolver:
            live_target = await resolver.resolve(
                sku=sku,
                destination_country=country_code,
                category_id=category_id,
                attributes=attributes or {},
                optional_attribute_keys=set(),
                supplier_size_inches=target.get("supplier_size_inches"),
                supplier_size_cm=target.get("supplier_size_cm"),
                slot_size_label=target.get("slot_size_label"),
                wrap_margin_pct=0.0,
            )

        live_source = live_target.get("print_area_source")
        if live_source not in {"prodigi_product_details", "prodigi_product_dimensions"}:
            return None

        live_width = self._positive_int(live_target.get("print_area_width_px"))
        live_height = self._positive_int(live_target.get("print_area_height_px"))
        baked_width = self._positive_int(target.get("width_px"))
        baked_height = self._positive_int(target.get("height_px"))
        if not live_width or not live_height or not baked_width or not baked_height:
            return None

        if not self._dimensions_match(
            baked_width=baked_width,
            baked_height=baked_height,
            live_width=live_width,
            live_height=live_height,
        ):
            return None

        return {
            **target,
            "width_px": live_width,
            "height_px": live_height,
            "print_area_name": live_target.get("print_area_name") or target.get("print_area_name") or "default",
            "print_area_source": live_source,
            "print_area_dimensions": live_target.get("print_area_dimensions")
            or target.get("print_area_dimensions"),
            "prodigi_verified": True,
        }

    def _dimensions_match(
        self,
        *,
        baked_width: int,
        baked_height: int,
        live_width: int,
        live_height: int,
    ) -> bool:
        # API values are integer pixels, but keep a tiny tolerance for provider rounding drift.
        tolerance_px = 2
        return (
            abs(baked_width - live_width) <= tolerance_px
            and abs(baked_height - live_height) <= tolerance_px
        )

    def _positive_int(self, value: Any) -> int | None:
        try:
            parsed = int(value)
        except (TypeError, ValueError):
            return None
        return parsed if parsed > 0 else None

    def render_from_master(
        self,
        *,
        master_asset: ArtworkPrintAssetOrm,
        category_id: str,
        slot_size_label: str,
        target_width: int,
        target_height: int,
        output_dir: Path,
        white_border_pct: float = 0.0,
    ) -> dict[str, Any]:
        master_path = Path(str(master_asset.file_url or "").lstrip("/"))
        if not master_path.exists():
            raise FileNotFoundError(f"Master print asset not found: {master_path}")

        output_dir.mkdir(parents=True, exist_ok=True)
        if category_id == "paperPrintRolled" and white_border_pct <= 0:
            white_border_pct = 5.0
        safe_category = self._sanitize_path_fragment(category_id, "category")
        safe_size = self._sanitize_path_fragment(slot_size_label, "size")
        filename = f"{safe_category}_{safe_size}_{master_asset.id}.png"
        dest_path = output_dir / filename

        with Image.open(master_path) as source_img:
            oriented_width, oriented_height = self._orient_target_to_master(
                source_img=source_img,
                target_width=target_width,
                target_height=target_height,
            )
            rendered, mode = self._build_exact_image(
                source_img=source_img,
                category_id=category_id,
                target_width=oriented_width,
                target_height=oriented_height,
                white_border_pct=white_border_pct,
            )
            save_kwargs: dict[str, Any] = {}
            icc_profile = source_img.info.get("icc_profile")
            if icc_profile:
                save_kwargs["icc_profile"] = icc_profile
            if rendered.mode not in {"RGB", "RGBA", "L"}:
                rendered = rendered.convert("RGBA" if "A" in rendered.getbands() else "RGB")
            rendered.save(dest_path, format="PNG", **save_kwargs)

        public_url = "/" + dest_path.as_posix()
        return {
            "file_url": public_url,
            "file_path": str(dest_path),
            "width_px": oriented_width,
            "height_px": oriented_height,
            "source_master_asset_id": int(master_asset.id),
            "derivative_kind": mode,
        }

    def _build_exact_image(
        self,
        *,
        source_img: Image.Image,
        category_id: str,
        target_width: int,
        target_height: int,
        white_border_pct: float = 0.0,
    ) -> tuple[Image.Image, str]:
        # Paper categories: apply white borders programmatically
        if category_id in PAPER_CATEGORIES and white_border_pct > 0:
            return (
                self._apply_white_border(
                    source_img, target_width, target_height, white_border_pct
                ),
                "white_border_contain",
            )
        # Canvas and non-bordered paper: cover-crop as before
        return (
            ImageOps.fit(
                source_img,
                (target_width, target_height),
                method=Image.Resampling.LANCZOS,
                centering=(0.5, 0.5),
            ),
            "cover_crop_resize",
        )

    def _apply_white_border(
        self,
        source_img: Image.Image,
        target_width: int,
        target_height: int,
        border_pct: float,
    ) -> Image.Image:
        """
        Apply a programmatic white border around the artwork.

        Replicates the Photoshop workflow:
        1. Create a white fill layer (background) at target dimensions
        2. Scale the artwork down by (100 - 2*border_pct)% to create equal
           borders on all four sides
        3. Center the scaled artwork on the white background

        For example, with border_pct=5.0:
        - The artwork is scaled to 90% of the target area (5% border on each side)
        - Result: artwork centered on white background with equal white margins
        """
        # Calculate the inner artwork area (leaving border_pct% on each side)
        scale_factor = 1.0 - (2.0 * border_pct / 100.0)
        inner_width = max(1, int(target_width * scale_factor))
        inner_height = max(1, int(target_height * scale_factor))

        # Fit the source image into the inner area maintaining aspect ratio
        fitted = ImageOps.contain(
            source_img,
            (inner_width, inner_height),
            method=Image.Resampling.LANCZOS,
        )

        # Ensure compatible color mode
        if fitted.mode not in {"RGB", "RGBA", "L"}:
            fitted = fitted.convert("RGBA" if "A" in fitted.getbands() else "RGB")

        # Create the white background canvas at full target size
        canvas_mode = "RGBA" if fitted.mode == "RGBA" else "RGB"
        background_color = (255, 255, 255, 255) if canvas_mode == "RGBA" else "white"
        canvas = Image.new(canvas_mode, (target_width, target_height), background_color)

        # Center the fitted artwork on the canvas
        left = round((target_width - fitted.width) / 2)
        top = round((target_height - fitted.height) / 2)

        if fitted.mode == "RGBA":
            canvas.alpha_composite(fitted, (left, top))
        else:
            canvas.paste(fitted, (left, top))

        return canvas

    def _orient_target_to_master(
        self,
        *,
        source_img: Image.Image,
        target_width: int,
        target_height: int,
    ) -> tuple[int, int]:
        source_width, source_height = source_img.size
        if source_width == source_height:
            return target_width, target_height
        if source_width > source_height and target_width < target_height:
            return target_height, target_width
        if source_height > source_width and target_width > target_height:
            return target_height, target_width
        return target_width, target_height

    def _sanitize_path_fragment(self, value: str | None, fallback: str) -> str:
        raw = (value or "").strip()
        sanitized = re.sub(r"[^a-zA-Z0-9._-]+", "-", raw).strip("-_.")
        return sanitized or fallback
