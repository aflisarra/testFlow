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
    openrouter_api_key: str

    # per-operation timeouts (seconds)
    openrouter_timeout: int
    openrouter_chat_timeout: int
    openrouter_test_plans_timeout: int
    openrouter_test_cases_timeout: int
    openrouter_test_translator_timeout: int


def get_settings() -> Settings:
    """
    Centralized env config.
    Supports OpenRouter variables with fallback to older xAI names.
    """
    openrouter_timeout = _get_int("OPENROUTER_TIMEOUT", _get_int("XAI_TIMEOUT", 120))
    model_name = (
        os.getenv("OPENROUTER_MODEL")
        or os.getenv("XAI_MODEL")
        or os.getenv("MODEL_NAME")
        or "google/gemini-2.5-flash"
    ).strip() or "google/gemini-2.5-flash"

    api_key = (
        os.getenv("OPENROUTER_API_KEY")
        or os.getenv("XAI_API_KEY")
        or ""
    ).strip()

    return Settings(
        model_name=model_name,
        use_mock=_get_bool("USE_MOCK", False),
        debug_errors=_get_bool("DEBUG_ERRORS", False),
        openrouter_api_key=api_key,
        openrouter_timeout=openrouter_timeout,
        openrouter_chat_timeout=_get_int(
            "OPENROUTER_CHAT_TIMEOUT",
            _get_int("XAI_CHAT_TIMEOUT", openrouter_timeout)
        ),
        openrouter_test_plans_timeout=_get_int(
            "OPENROUTER_TEST_PLANS_TIMEOUT",
            _get_int("XAI_TEST_PLANS_TIMEOUT", openrouter_timeout)
        ),
        openrouter_test_cases_timeout=_get_int(
            "OPENROUTER_TEST_CASES_TIMEOUT",
            _get_int("XAI_TEST_CASES_TIMEOUT", openrouter_timeout)
        ),
        openrouter_test_translator_timeout=_get_int(
            "OPENROUTER_TEST_TRANSLATOR_TIMEOUT",
            _get_int("XAI_TEST_TRANSLATOR_TIMEOUT", openrouter_timeout)
        ),
    )
