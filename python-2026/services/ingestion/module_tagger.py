"""Embedding-based tagging against generated, per-spec module cards."""

from __future__ import annotations

import os
import re
from functools import lru_cache
from typing import Any

from services.ingestion.items import Item


EMBEDDING_MODEL_NAME = "paraphrase-multilingual-MiniLM-L12-v2"
MODULE_THRESHOLD = float(os.getenv("ITEM_MODULE_THRESHOLD", "0.25"))
HEADING_BOOST = 0.08


@lru_cache(maxsize=1)
def get_embedding_model():
    """Lazy-load the multilingual model so server startup stays fast."""
    from sentence_transformers import SentenceTransformer

    return SentenceTransformer(EMBEDDING_MODEL_NAME)


def _normalise(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").casefold()).strip()


def tag_module(items: list[Item], module_list: list[dict[str, Any]]) -> list[Item]:
    """Tag every item against this spec's module descriptions.

    Assignment is observational in Phase 4; no generation path filters on the
    result until the threshold is calibrated against the SonicWave gold set.
    """
    if not items or not module_list:
        return items
    descriptions = [str(module["description"]) for module in module_list]
    model = get_embedding_model()
    item_vectors = model.encode([item.text for item in items], normalize_embeddings=True)
    module_vectors = model.encode(descriptions, normalize_embeddings=True)
    similarities = item_vectors @ module_vectors.T

    for index, item in enumerate(items):
        scores = similarities[index].copy()
        heading = _normalise(item.heading_path[-1] if item.heading_path else "")
        if heading:
            for module_index, module in enumerate(module_list):
                if _normalise(str(module["name"])) in heading:
                    scores[module_index] += HEADING_BOOST
        best_index = int(scores.argmax())
        score = float(scores[best_index])
        module_name = str(module_list[best_index]["name"])
        item.module_score = round(score, 4)
        item.module = module_name if score >= MODULE_THRESHOLD else "UNTAGGED"
    return items
