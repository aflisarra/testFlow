# ============================================================
# utils/ollama.py
#
# - Robust JSON parsing from LLM output
# - Ollama invocation via HTTP API (preferred) with safe fallback to CLI
# - Timeout-safe: never exceeds the caller timeout across HTTP+CLI
# ============================================================

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import time
import urllib.error
import urllib.request

from utils.logger import get_logger, log_event, log_error


logger = get_logger("utils.ollama")


def get_ollama_model() -> str:
    return os.getenv("OLLAMA_MODEL", "qwen2.5:3b-instruct")


def get_ollama_path() -> str:
    path = shutil.which("ollama")
    if path:
        return path
    return r"C:\Users\MSI\AppData\Local\Programs\Ollama\ollama.exe"


def _default_timeout() -> int:
    try:
        return int(os.getenv("OLLAMA_TIMEOUT", "300"))
    except ValueError:
        return 300


def _strip_ansi(text: str) -> str:
    """
    Remove terminal ANSI escape sequences that can break JSON.
    """
    ansi_escape = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")
    return ansi_escape.sub("", text or "")


def _strip_code_fences(text: str) -> str:
    trimmed = (text or "").strip()
    trimmed = re.sub(r"^```(?:json|JSON)?\s*", "", trimmed)
    trimmed = re.sub(r"\s*```$", "", trimmed)
    return trimmed.strip()


def _extract_json_array(text: str):
    depth = 0
    start = None
    for i, ch in enumerate(text or ""):
        if ch == "[":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "]":
            depth -= 1
            if depth == 0 and start is not None:
                candidate = text[start : i + 1]
                try:
                    return json.loads(candidate)
                except json.JSONDecodeError:
                    start = None
    return None


def _extract_json_object(text: str):
    depth = 0
    start = None
    for i, ch in enumerate(text or ""):
        if ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0 and start is not None:
                candidate = text[start : i + 1]
                try:
                    return json.loads(candidate)
                except json.JSONDecodeError:
                    start = None
    return None


def parse_json_from_ollama(text: str):
    """
    Best-effort JSON parser for Ollama responses.
    Accepts:
    - direct JSON
    - fenced code blocks
    - noisy text around JSON
    - trailing commas
    """
    raw = _strip_ansi((text or "").strip())

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass

    stripped = _strip_code_fences(raw)
    if stripped != raw:
        try:
            return json.loads(stripped)
        except json.JSONDecodeError:
            pass

    arr = _extract_json_array(stripped or raw)
    if arr is not None:
        return arr

    obj = _extract_json_object(stripped or raw)
    if obj is not None:
        for key in ("test_cases", "testCases", "cases", "results", "items"):
            if isinstance(obj.get(key), list):
                return obj[key]
        if isinstance(obj, dict) and all(k in obj for k in ("id", "title", "steps", "expected_result")):
            return [obj]
        return obj

    cleaned = re.sub(r",\s*([}\]])", r"\1", stripped or raw)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    arr2 = _extract_json_array(cleaned)
    if arr2 is not None:
        return arr2

    raise ValueError(
        "Cannot parse JSON from Ollama response.\n"
        f"Raw output (first 500 chars):\n{raw[:500]}"
    )


def run_ollama(prompt: str, timeout: int | None = None, *, json_mode: bool = False) -> str:
    """
    Send a prompt to Ollama.
    Strategy:
    1) HTTP API (preferred)
    2) CLI fallback (only for non-timeout HTTP errors)

    Timeout-safe:
    - The combined duration of (HTTP attempt + CLI fallback) never exceeds `timeout`.
    - If HTTP times out, we raise a timeout immediately (no CLI fallback).
    """
    effective_timeout = timeout if timeout is not None else _default_timeout()
    effective_timeout = max(1, int(effective_timeout))

    start = time.monotonic()
    deadline = start + effective_timeout

    # By default, allow the HTTP request to use the full caller timeout.
    # You can override this with OLLAMA_HTTP_TIMEOUT when you want a quicker fail-fast behavior.
    http_timeout_default = effective_timeout
    try:
        http_timeout = int(os.getenv("OLLAMA_HTTP_TIMEOUT", str(http_timeout_default)))
    except ValueError:
        http_timeout = http_timeout_default
    http_timeout = max(1, min(effective_timeout, http_timeout))

    ollama_host = os.getenv("OLLAMA_HOST", "http://localhost:11434").rstrip("/")
    url = f"{ollama_host}/api/generate"
    options: dict[str, object] = {
        "num_ctx": int(os.getenv("OLLAMA_NUM_CTX", "4096")),
    "temperature": float(os.getenv("OLLAMA_TEMPERATURE", "0.7")),
    # Case generation includes detailed steps and stepDetails. 800 tokens
    # frequently truncates the JSON before the closing braces.
    "num_predict": int(os.getenv("OLLAMA_NUM_PREDICT", "2400")),
    }
    num_predict = os.getenv("OLLAMA_NUM_PREDICT", "").strip()
    if num_predict:
        try:
            options["num_predict"] = int(num_predict)
        except ValueError:
            pass

    req_body = {
        "model": get_ollama_model(),
        "prompt": prompt,
        "stream": False,
        "options": options,
    }
    if json_mode:
        # Ollama constrains the model to a JSON response instead of allowing a
        # conversational answer when the source specification is imperfect.
        req_body["format"] = "json"
    data = json.dumps(req_body).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})

    try:
        log_event(logger, "ollama_http_start", timeout=http_timeout)
        with urllib.request.urlopen(req, timeout=http_timeout) as response:
            resp_body = response.read().decode("utf-8")
            js = json.loads(resp_body)
            log_event(logger, "ollama_http_success", elapsed_ms=int((time.monotonic() - start) * 1000))
            return js.get("response", "")
    except Exception as exc:
        msg = str(exc).lower()
        if isinstance(exc, TimeoutError) or "timed out" in msg:
            log_error(logger, "ollama_http_timeout", error=str(exc), timeout=http_timeout)
            # Make the error message reflect the actual HTTP timeout.
            raise subprocess.TimeoutExpired(cmd="ollama_http", timeout=http_timeout)

        log_error(logger, "ollama_http_fallback", error=str(exc))

    remaining = int(max(0, deadline - time.monotonic()))
    if remaining <= 0:
        raise subprocess.TimeoutExpired(cmd="ollama_cli", timeout=effective_timeout)

    # CLI fallback is not supported in Docker/Linux environments.
    # The HTTP API above is the only supported method.
    log_error(logger, "ollama_http_failed", error="HTTP API failed and CLI fallback is disabled in Docker")
    raise RuntimeError(
        "Ollama HTTP API is unreachable. "
        f"Make sure the Ollama container is running and OLLAMA_HOST is set correctly (current: {ollama_host})."
    )
