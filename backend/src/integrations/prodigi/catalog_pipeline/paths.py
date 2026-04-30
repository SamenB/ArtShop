from __future__ import annotations

from pathlib import Path

from src.config import settings

BACKEND_ROOT = Path(__file__).resolve().parents[4]
REPO_ROOT = BACKEND_ROOT.parent
DEFAULT_CURATED_CSV_RELATIVE_PATH = Path(
    "src/integrations/prodigi/data/prodigi_storefront_source.csv"
)


def resolve_backend_path(value: str | Path) -> Path:
    path = Path(value).expanduser()
    if path.is_absolute():
        return path.resolve()
    return (BACKEND_ROOT / path).resolve()


def resolve_repo_path(value: str | Path) -> Path:
    path = Path(value).expanduser()
    if path.is_absolute():
        return path.resolve()
    return (REPO_ROOT / path).resolve()


def resolve_curated_csv_path(path: str | Path | None = None) -> Path:
    configured = path or settings.PRODIGI_CURATED_CSV_PATH
    configured_path = Path(configured).expanduser()
    if not configured_path.is_absolute() and configured_path.parts[:1] == ("backend",):
        return resolve_repo_path(configured_path)
    return resolve_backend_path(configured)


def resolve_raw_csv_root(path: str | Path | None = None, *, require_exists: bool = True) -> Path:
    configured = Path(str(path or settings.PRODIGI_RAW_CSV_ROOT)).expanduser()
    if configured.is_absolute():
        root = configured.resolve()
    else:
        repo_candidate = (REPO_ROOT / configured).resolve()
        backend_candidate = (BACKEND_ROOT / configured).resolve()
        root = repo_candidate if repo_candidate.exists() else backend_candidate

    if require_exists and not root.exists():
        raise FileNotFoundError(
            "Prodigi raw CSV root does not exist. Set PRODIGI_RAW_CSV_ROOT to the "
            f"local supplier dump directory. Resolved path: {root}"
        )
    if require_exists and not root.is_dir():
        raise NotADirectoryError(f"Prodigi raw CSV root is not a directory: {root}")
    return root
