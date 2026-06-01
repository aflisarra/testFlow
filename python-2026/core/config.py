from __future__ import annotations

import os
from dataclasses import dataclass


def _get_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name, str(default)).strip().lower()
    return raw in ("1", "true", "yes", "y", "on")


def _get_int(name: str, default: int) -> int:
    raw = os.getenv(name, str(default)).strip()
    try:
        return int(raw)
    except ValueError:
        return default


@dataclass(frozen=True)
class Settings:
    model_name: str
    use_mock: bool
    debug_errors: bool

    ollama_timeout: int
    ollama_chat_timeout: int
    ollama_test_plans_timeout: int
    ollama_test_cases_timeout: int
    ollama_test_translator_timeout: int


def get_settings() -> Settings:
    """
    Centralized env config.

    IMPORTANT: keep compatibility with existing env var names used by Node integration.
    """
    ollama_timeout = _get_int("OLLAMA_TIMEOUT", 300)
    model_name = (os.getenv("MODEL_NAME") or os.getenv("OLLAMA_MODEL") or "mistral").strip() or "mistral"
    return Settings(
        model_name=model_name,
        use_mock=_get_bool("USE_MOCK", False),
        debug_errors=_get_bool("DEBUG_ERRORS", False),
        ollama_timeout=ollama_timeout,
        ollama_chat_timeout=_get_int("OLLAMA_CHAT_TIMEOUT", ollama_timeout),
        ollama_test_plans_timeout=_get_int("OLLAMA_TEST_PLANS_TIMEOUT", ollama_timeout),
        ollama_test_cases_timeout=_get_int("OLLAMA_TEST_CASES_TIMEOUT", ollama_timeout),
        ollama_test_translator_timeout=_get_int("OLLAMA_TEST_TRANSLATOR_TIMEOUT", ollama_timeout),
    )
