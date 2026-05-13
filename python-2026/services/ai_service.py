from __future__ import annotations

from typing import Any, Optional

from core.config import get_settings
import time

from utils.logger import get_logger, log_event, log_error
from utils.ollama import run_ollama
from utils.json_cleaner import safe_json_loads


logger = get_logger("services.ai_service")


class AiService:
    def __init__(self) -> None:
        self.settings = get_settings()

    def generate_json(self, *, prompt: str, timeout: int) -> Any:
        started = time.monotonic()
        log_event(
            logger,
            "ai_generation_started",
            model=self.settings.model_name,
            timeout=timeout,
            prompt_chars=len(prompt or ""),
        )
        try:
            reply = run_ollama(prompt, timeout=timeout)
            try:
                data = safe_json_loads(reply)
            except Exception:
                # One lightweight self-healing pass:
                # ask model to reformat its previous output as strict JSON only.
                repair_prompt = (
                    "Return ONLY valid minified JSON. Do not add markdown, explanations, or code fences.\n"
                    "Fix escaping, commas, and quotes while preserving meaning.\n"
                    "Input:\n"
                    f"{reply}"
                )
                repaired_reply = run_ollama(repair_prompt, timeout=max(20, int(timeout * 0.35)))
                data = safe_json_loads(repaired_reply)
            log_event(logger, "ai_generation_success", elapsed_ms=int((time.monotonic() - started) * 1000))
            return data
        except Exception as exc:
            log_error(
                logger,
                "ai_generation_error",
                error=str(exc),
                elapsed_ms=int((time.monotonic() - started) * 1000),
            )
            raise


def get_ai_service() -> AiService:
    # Lightweight factory; can be swapped later for DI/container.
    return AiService()
