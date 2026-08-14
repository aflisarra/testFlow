"""Embedding-based tagging against generated, per-spec module cards."""

from __future__ import annotations

import re
from functools import lru_cache
from typing import Any

from services.ingestion.items import Item


EMBEDDING_MODEL_NAME = "paraphrase-multilingual-MiniLM-L12-v2"
# Thresholds remain disabled until calibrated fixtures are available. The
# tagger nevertheless records scores/margins and no longer classifies roles
# that cannot provide functional-plan evidence.
MODULE_THRESHOLD: float | None = None
MODULE_MARGIN_THRESHOLD: float | None = None
HEADING_BOOST = 0.08
MODULE_ASSIGNMENT_ROLES = frozenset(
    {"CONTEXT", "ACTOR", "FEATURE", "REQUIREMENT", "ACCEPTANCE", "NON_FUNCTIONAL"}
)


@lru_cache(maxsize=1)
def get_embedding_model():
    """Lazy-load the multilingual model so server startup stays fast."""
    from sentence_transformers import SentenceTransformer

    return SentenceTransformer(EMBEDDING_MODEL_NAME)


def _normalise(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").casefold()).strip()


def _module_id(module: dict[str, Any], index: int) -> str:
    return str(module.get("id") or f"MOD-{index + 1:03d}")


def _exclude_item(item: Item) -> None:
    item.module = "UNTAGGED"
    item.module_ids = []
    item.primary_module_id = None
    item.module_method = "none"
    item.module_score = None
    item.module_margin = None
    item.module_disposition = "excluded"


def _unassign_item(item: Item) -> None:
    item.module = "UNTAGGED"
    item.module_ids = []
    item.primary_module_id = None
    item.module_method = "none"
    item.module_disposition = "unassigned"


def tag_module(items: list[Item], module_list: list[dict[str, Any]]) -> list[Item]:
    """Tag every item against this spec's module descriptions.

    Assignment is observational in Phase 4; no generation path filters on the
    result until the threshold is calibrated against the SonicWave gold set.
    """
    if not items or not module_list:
        return items
    candidates = [item for item in items if item.role in MODULE_ASSIGNMENT_ROLES]
    for item in items:
        if item.role not in MODULE_ASSIGNMENT_ROLES:
            _exclude_item(item)
    if not candidates:
        return items

    items_by_id = {item.id: item for item in items}
    descriptions: list[str] = []
    cited_by: dict[str, list[int]] = {}
    for module_index, module in enumerate(module_list):
        source_ids = [str(value) for value in module.get("source_item_ids") or []]
        for source_id in source_ids:
            cited_by.setdefault(source_id, []).append(module_index)
        source_text = " ".join(items_by_id[source_id].text for source_id in source_ids if source_id in items_by_id)
        descriptions.append(
            " ".join(
                value for value in (
                    str(module.get("name") or ""),
                    str(module.get("description") or ""),
                    source_text,
                ) if value
            )
        )
    model = get_embedding_model()
    item_vectors = model.encode(
        [" ".join([*item.heading_path, item.text]) for item in candidates],
        normalize_embeddings=True,
    )
    module_vectors = model.encode(descriptions, normalize_embeddings=True)
    similarities = item_vectors @ module_vectors.T

    for index, item in enumerate(candidates):
        cited_indices = cited_by.get(item.id, [])
        if len(cited_indices) == 1:
            cited_index = cited_indices[0]
            module = module_list[cited_index]
            module_id = _module_id(module, cited_index)
            item.module = str(module["name"])
            item.module_ids = [module_id]
            item.primary_module_id = module_id
            item.module_method = "source"
            item.module_score = 1.0
            item.module_margin = 1.0
            item.module_disposition = "assigned"
            continue
        if len(cited_indices) > 1 and item.role == "NON_FUNCTIONAL":
            item.module = "CROSS_CUTTING"
            item.module_ids = [_module_id(module_list[module_index], module_index) for module_index in cited_indices]
            item.primary_module_id = None
            item.module_method = "source"
            item.module_score = 1.0
            item.module_margin = 0.0
            item.module_disposition = "cross_cutting"
            continue
        if len(cited_indices) > 1:
            _unassign_item(item)
            item.module_score = 1.0
            item.module_margin = 0.0
            continue

        scores = similarities[index].copy()
        heading = _normalise(item.heading_path[-1] if item.heading_path else "")
        if heading:
            for module_index, module in enumerate(module_list):
                if _normalise(str(module["name"])) in heading:
                    scores[module_index] += HEADING_BOOST
        best_index = int(scores.argmax())
        score = float(scores[best_index])
        ordered_scores = sorted((float(value) for value in scores), reverse=True)
        margin = score - ordered_scores[1] if len(ordered_scores) > 1 else score
        if (
            (MODULE_THRESHOLD is not None and score < MODULE_THRESHOLD)
            or (MODULE_MARGIN_THRESHOLD is not None and margin < MODULE_MARGIN_THRESHOLD)
        ):
            _unassign_item(item)
            item.module_score = round(score, 4)
            item.module_margin = round(margin, 4)
            continue
        module_name = str(module_list[best_index]["name"])
        module_id = _module_id(module_list[best_index], best_index)
        item.module_score = round(score, 4)
        item.module_margin = round(margin, 4)
        item.module = module_name
        item.module_ids = [module_id]
        item.primary_module_id = module_id
        item.module_method = "hybrid"
        item.module_disposition = "assigned"
    return items
