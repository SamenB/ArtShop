from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Sequence
from typing import Any

from fastapi import APIRouter


class PrintProvider(ABC):
    """
    Stable backend-facing contract for print-on-demand integrations.

    The rest of the application should depend on this interface instead of
    importing provider-specific services directly. Swapping vendors then becomes
    mostly a matter of adding another adapter that satisfies this contract.
    """

    provider_key: str

    def get_api_routers(self) -> Sequence[APIRouter]:
        """
        Optional provider-specific routers such as webhooks or admin diagnostics.
        Public storefront routes should stay provider-agnostic and live elsewhere.
        """
        return ()

    @abstractmethod
    async def build_shop_summaries(
        self,
        *,
        db: Any,
        artworks: list[Any],
        country_code: str,
    ) -> dict[int, dict[str, Any]]:
        """Return compact shop-card summaries for many artworks in one country."""

    @abstractmethod
    def build_summary_from_storefront_payload(
        self,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        """Collapse a detailed artwork storefront payload into a shop-friendly summary."""

    @abstractmethod
    async def get_artwork_storefront(
        self,
        *,
        db: Any,
        artwork_id_or_slug: str,
        country_code: str,
    ) -> dict[str, Any]:
        """Return the detailed storefront payload for one artwork in one country."""

    @abstractmethod
    async def get_print_profile_bundle(
        self,
        *,
        db: Any,
        artwork_id: int,
    ) -> dict[str, Any]:
        """Return artwork-specific production profile metadata for the active provider."""

    @abstractmethod
    def extract_source_metadata(
        self,
        *,
        file_path: str,
        public_url: str | None = None,
    ) -> dict[str, Any]:
        """Extract provider-aware metadata from an uploaded print source asset."""

    @abstractmethod
    async def rematerialize_artworks(
        self,
        *,
        db: Any,
        artwork_ids: list[int],
    ) -> None:
        """Refresh any provider-specific read models affected by artwork changes."""

    @abstractmethod
    async def submit_paid_order_items(
        self,
        *,
        order: Any,
        db_session: Any,
    ) -> None:
        """Submit paid print items to the active provider."""
