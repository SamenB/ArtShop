from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from fastapi import APIRouter

from src.print_on_demand.base import PrintProvider


class ProdigiPrintProvider(PrintProvider):
    provider_key = "prodigi"

    def get_api_routers(self) -> Sequence[APIRouter]:
        from src.integrations.prodigi.api.admin_prodigi import router as admin_prodigi_router
        from src.integrations.prodigi.api.print_options import router as print_options_router
        from src.integrations.prodigi.api.prodigi_callbacks import (
            router as prodigi_callbacks_router,
        )

        return (print_options_router, prodigi_callbacks_router, admin_prodigi_router)

    async def build_shop_summaries(
        self,
        *,
        db: Any,
        artworks: list[Any],
        country_code: str,
    ) -> dict[int, dict[str, Any]]:
        from src.integrations.prodigi.services.prodigi_artwork_collection_storefront import (
            ProdigiArtworkCollectionStorefrontService,
        )

        return await ProdigiArtworkCollectionStorefrontService(db).build_shop_summaries(
            artworks,
            country_code=country_code,
        )

    def build_summary_from_storefront_payload(
        self,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        from src.integrations.prodigi.services.prodigi_artwork_collection_storefront import (
            ProdigiArtworkCollectionStorefrontService,
        )

        return ProdigiArtworkCollectionStorefrontService.build_summary_from_storefront_payload(
            payload
        )

    async def get_artwork_storefront(
        self,
        *,
        db: Any,
        artwork_id_or_slug: str,
        country_code: str,
    ) -> dict[str, Any]:
        from src.integrations.prodigi.services.prodigi_artwork_storefront import (
            ProdigiArtworkStorefrontService,
        )

        return await ProdigiArtworkStorefrontService(db).get_artwork_storefront(
            artwork_id_or_slug=artwork_id_or_slug,
            country_code=country_code,
        )

    async def get_print_profile_bundle(
        self,
        *,
        db: Any,
        artwork_id: int,
    ) -> dict[str, Any]:
        from src.services.artwork_print_profiles import ArtworkPrintProfileService

        return await ArtworkPrintProfileService(db).get_profile_bundle(artwork_id)

    def extract_source_metadata(
        self,
        *,
        file_path: str,
        public_url: str | None = None,
    ) -> dict[str, Any]:
        from src.services.artwork_print_profiles import ArtworkPrintProfileService

        return ArtworkPrintProfileService.extract_source_metadata(
            file_path,
            public_url=public_url,
        )

    async def rematerialize_artworks(
        self,
        *,
        db: Any,
        artwork_ids: list[int],
    ) -> None:
        from src.integrations.prodigi.services.prodigi_artwork_storefront_materializer import (
            ProdigiArtworkStorefrontMaterializerService,
        )

        await ProdigiArtworkStorefrontMaterializerService(db).materialize_active_bake(
            artwork_ids=artwork_ids
        )

    async def submit_paid_order_items(
        self,
        *,
        order: Any,
        db_session: Any,
    ) -> None:
        from src.integrations.prodigi.services.prodigi_orders import ProdigiOrderService

        await ProdigiOrderService.submit_order_items(order, db_session)
