from __future__ import annotations

import json
import logging
import os
import sys
from typing import Any


def _json_default(obj: Any) -> str:
    try:
        return str(obj)
    except Exception:
        return "<unserializable>"


def setup_logging() -> None:
    """
    Minimal, production-friendly logging.
    - One line per event
    - JSON payload in message for easy parsing
    """
    level_name = os.getenv("LOG_LEVEL", "INFO").upper().strip()
    level = getattr(logging, level_name, logging.INFO)

    root = logging.getLogger()
    if root.handlers:
        # avoid duplicate handlers on reload
        return

    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(level)
    formatter = logging.Formatter(
        fmt="%(asctime)s %(levelname)s %(name)s %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S%z",
    )
    handler.setFormatter(formatter)
    root.setLevel(level)
    root.addHandler(handler)


def get_logger(name: str) -> logging.Logger:
    setup_logging()
    return logging.getLogger(name)


def log_event(logger: logging.Logger, event: str, **fields: Any) -> None:
    payload = {"event": event, **fields}
    logger.info(json.dumps(payload, ensure_ascii=False, default=_json_default))


def log_error(logger: logging.Logger, event: str, **fields: Any) -> None:
    payload = {"event": event, **fields}
    logger.error(json.dumps(payload, ensure_ascii=False, default=_json_default))

