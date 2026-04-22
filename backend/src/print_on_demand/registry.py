from __future__ import annotations

from functools import lru_cache

from src.config import settings
from src.print_on_demand.base import PrintProvider
from src.print_on_demand.providers.prodigi import ProdigiPrintProvider

PROVIDER_REGISTRY: dict[str, type[PrintProvider]] = {
    "prodigi": ProdigiPrintProvider,
}


@lru_cache(maxsize=1)
def get_print_provider() -> PrintProvider:
    provider_key = settings.PRINT_PROVIDER.strip().lower()
    provider_cls = PROVIDER_REGISTRY.get(provider_key)
    if provider_cls is None:
        supported = ", ".join(sorted(PROVIDER_REGISTRY))
        raise RuntimeError(
            f"Unsupported PRINT_PROVIDER '{settings.PRINT_PROVIDER}'. "
            f"Supported values: {supported}."
        )
    return provider_cls()
