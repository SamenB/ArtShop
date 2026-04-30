from __future__ import annotations

from typing import Any

from src.integrations.prodigi.services.prodigi_artwork_storefront_materializer import (
    ProdigiArtworkStorefrontMaterializerService,
)


class ProdigiCatalogPayloadMaterializer:
    """Final pipeline step: persist per-artwork storefront payloads from active bake."""

    def __init__(self, db: Any):
        self.db = db

    async def materialize_active_bake(self) -> dict[str, Any]:
        return await ProdigiArtworkStorefrontMaterializerService(
            self.db
        ).materialize_active_bake()
