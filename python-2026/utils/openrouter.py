# ============================================================
# utils/openrouter.py
#
# OpenRouter inference via the OpenAI-compatible SDK.
# ============================================================

from __future__ import annotations

import os
import time

from openai import OpenAI

from utils.logger import get_logger, log_event, log_error

logger = get_logger("utils.openrouter")

# ── OpenRouter base URL (OpenAI-compatible) ──────────────────
_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
_DEFAULT_MODEL = "google/gemini-2.5-flash"  # sensible default on OpenRouter


def _get_client() -> OpenAI:
    api_key = os.getenv("OPENROUTER_API_KEY", "")
    if not api_key:
        # Fallback to general API key or notify
        raise RuntimeError(
            "OPENROUTER_API_KEY is not set. "
            "Add it to your .env file: OPENROUTER_API_KEY=your_key_here"
        )
    
    # Custom headers are recommended by OpenRouter
    default_headers = {
        "HTTP-Referer": "https://github.com/aflisarra/testFlow",
        "X-Title": "TestFlow Automation",
    }
    
    return OpenAI(
        api_key=api_key,
        base_url=_OPENROUTER_BASE_URL,
        default_headers=default_headers,
    )


def _get_model() -> str:
    return os.getenv("OPENROUTER_MODEL", _DEFAULT_MODEL).strip() or _DEFAULT_MODEL


def _default_timeout() -> int:
    try:
        return int(os.getenv("OPENROUTER_TIMEOUT", "120"))
    except ValueError:
        return 120


def run_openrouter(
    prompt: str,
    timeout: int | None = None,
    max_tokens: int | None = None,
) -> str:
    """
    Send a prompt to OpenRouter and return the plain-text reply.

    Parameters
    ----------
    prompt     : The full prompt string.
    timeout    : Max seconds to wait for a reply (falls back to OPENROUTER_TIMEOUT env var).
    max_tokens : Output token cap. Falls back to OPENROUTER_MAX_TOKENS env var (default 1500).
                 Pass a higher value for endpoints that produce large JSON objects.

    Returns
    -------
    str  Raw reply text from the model.
    """
    effective_timeout = timeout if timeout is not None else _default_timeout()
    effective_timeout = max(1, int(effective_timeout))

    model = _get_model()
    temperature = float(os.getenv("OPENROUTER_TEMPERATURE", "0.1"))
    # Per-call override takes precedence over the env-var default.
    max_tokens = max_tokens if max_tokens is not None else int(os.getenv("OPENROUTER_MAX_TOKENS", "1500"))

    log_event(
        logger,
        "openrouter_request_start",
        model=model,
        timeout=effective_timeout,
        prompt_chars=len(prompt),
        temperature=temperature,
        max_tokens=max_tokens,
    )

    start = time.monotonic()
    try:
        client = _get_client()
        response = client.chat.completions.create(
            model=model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a test-automation assistant. "
                        "Always respond with valid minified JSON only — "
                        "no markdown, no explanations, no code fences."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            temperature=temperature,
            max_tokens=max_tokens,
            timeout=effective_timeout,
        )

        elapsed_ms = int((time.monotonic() - start) * 1000)
        reply = (response.choices[0].message.content or "").strip()

        log_event(
            logger,
            "openrouter_request_success",
            elapsed_ms=elapsed_ms,
            reply_chars=len(reply),
            model=model,
            usage=dict(response.usage) if response.usage else {},
        )

        return reply

    except Exception as exc:
        elapsed_ms = int((time.monotonic() - start) * 1000)
        log_error(
            logger,
            "openrouter_request_error",
            error=str(exc),
            elapsed_ms=elapsed_ms,
            model=model,
        )
        raise
