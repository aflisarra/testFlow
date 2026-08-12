from __future__ import annotations

from typing import Any

from core.config import get_settings
import time

from utils.logger import get_logger, log_event, log_error
from utils.openrouter import run_openrouter
from utils.json_cleaner import safe_json_loads


logger = get_logger("services.ai_service")


class AiService:
    def __init__(self) -> None:
        self.settings = get_settings()

    def generate_json(self, *, prompt: str, timeout: int, max_tokens: int | None = None) -> Any:
        started = time.monotonic()

        log_event(
            logger,
            "ai_generation_started",
            model=self.settings.model_name,
            timeout=timeout,
            prompt_chars=len(prompt or ""),
        )

        # ── STAGE 1: OpenRouter inference ──────────────────────────────────
        t_inference_start = time.monotonic()
        try:
            inference_options: dict[str, int] = {"timeout": timeout}
            if max_tokens is not None:
                inference_options["max_tokens"] = max_tokens
            reply = run_openrouter(prompt, **inference_options)
        except Exception as exc:
            log_error(
                logger,
                "ai_generation_error",
                stage="openrouter_inference",
                error=str(exc),
                elapsed_ms=int((time.monotonic() - started) * 1000),
            )
            raise
        t_inference_ms = int((time.monotonic() - t_inference_start) * 1000)

        log_event(logger, "⏱ STAGE inference",
                  inference_ms=t_inference_ms,
                  reply_chars=len(reply))

        with open("openrouter_response.txt", "w", encoding="utf-8") as f:
            f.write(reply)

        print("\n===== OPENROUTER RESPONSE =====")
        print(reply[:3000])
        print("===== END =====\n")

        # ── STAGE 2: JSON parse ────────────────────────────────────────────
        t_parse_start = time.monotonic()
        try:
            data = safe_json_loads(reply)
            t_parse_ms = int((time.monotonic() - t_parse_start) * 1000)
            log_event(logger, "⏱ STAGE parse", parse_ms=t_parse_ms, repaired=False)

        except Exception as e:
            t_parse_ms = int((time.monotonic() - t_parse_start) * 1000)
            print("JSON PARSE ERROR:", repr(e))
            log_event(logger, "⏱ STAGE parse_failed",
                      parse_ms=t_parse_ms, error=repr(e))

            # ── STAGE 3: Repair call ───────────────────────────────────────
            repair_prompt = (
                "Return ONLY valid minified JSON. "
                "Do not add markdown, explanations, or code fences.\n"
                "Fix escaping, commas, and quotes while preserving meaning.\n"
                "Input:\n"
                f"{reply}"
            )

            t_repair_start = time.monotonic()
            repair_options: dict[str, int] = {"timeout": 90}
            if max_tokens is not None:
                repair_options["max_tokens"] = max_tokens
            repaired_reply = run_openrouter(repair_prompt, **repair_options)
            t_repair_ms = int((time.monotonic() - t_repair_start) * 1000)

            log_event(logger, "⏱ STAGE repair_inference",
                      repair_ms=t_repair_ms,
                      repair_chars=len(repaired_reply))

            with open("openrouter_repaired_response.txt", "w", encoding="utf-8") as f:
                f.write(repaired_reply)

            print("\n===== REPAIRED RESPONSE =====")
            print(repaired_reply[:3000])
            print("===== END REPAIRED =====\n")

            t_reparse_start = time.monotonic()
            data = safe_json_loads(repaired_reply)
            t_reparse_ms = int((time.monotonic() - t_reparse_start) * 1000)
            log_event(logger, "⏱ STAGE reparse",
                      reparse_ms=t_reparse_ms, repaired=True)

        total_ms = int((time.monotonic() - started) * 1000)
        log_event(
            logger,
            "ai_generation_success",
            elapsed_ms=total_ms,
            breakdown={
                "inference_ms": t_inference_ms,
                "parse_ms": t_parse_ms,
                "total_ms": total_ms,
            },
        )

        return data


def get_ai_service() -> AiService:
    # Lightweight factory; can be swapped later for DI/container.
    return AiService()
