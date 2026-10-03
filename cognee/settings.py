"""Shared Cognee configuration for Vyapar AI.

Cognee reads the nearest .env and lets it override the environment, so we keep Cognee's own
non-secret settings in cognee/.env (created on first run) and inject the Gemini key from the app's
root .env at runtime. Both the LLM (graph extraction, answers) and embeddings use Gemini, as the
Cognee docs require configuring both sides.
"""
import os
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
DATASET = os.environ.get("COGNEE_DATASET", "vyapar")


def _read_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if path.exists():
        for line in path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def configure() -> None:
    app_env = _read_env(ROOT / ".env")
    key = os.environ.get("GEMINI_API_KEY") or app_env.get("GEMINI_API_KEY", "")
    model = os.environ.get("GEMINI_MODEL") or app_env.get("GEMINI_MODEL") or "gemini-2.5-flash"
    own_env = HERE / ".env"
    if not own_env.exists():
        own_env.write_text(
            "# Cognee settings for Vyapar AI (no secrets here; the key is injected from ../.env)\n"
            "LLM_PROVIDER=gemini\n"
            f"LLM_MODEL=gemini/{model}\n"
            "EMBEDDING_PROVIDER=gemini\n"
            "EMBEDDING_MODEL=gemini/gemini-embedding-001\n"
            "EMBEDDING_DIMENSIONS=768\n"
            "COGNEE_SKIP_CONNECTION_TEST=true\n"
            "LOG_LEVEL=ERROR\n"
        )
    os.chdir(HERE)  # so Cognee finds cognee/.env, not the app's .env
    os.environ["LLM_API_KEY"] = key
    os.environ["EMBEDDING_API_KEY"] = key
    os.environ.setdefault("LOG_LEVEL", "ERROR")
    if not key:
        print("! GEMINI_API_KEY is not set in ../.env. Ingest works, but cognify and search need it.")


def apply_storage(cognee_module) -> None:
    data = HERE / ".data"
    cognee_module.config.data_root_directory(str(data / "data"))
    cognee_module.config.system_root_directory(str(data / "system"))
