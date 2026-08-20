"""Observability and gold-alignment helpers for Phase 4 modules."""

from __future__ import annotations

from typing import Any

from services.ingestion.module_gold import GOLD_MODULE_FIXTURES
from services.ingestion.module_tagger import get_embedding_model


def compare_module_detection(
    legacy_modules: list[str], generated_modules: list[dict[str, Any]]
) -> dict[str, list[str]]:
    """Compare names for diagnostics only; this is not a quality score."""
    legacy = {str(name) for name in legacy_modules}
    generated = {str(module["name"]) for module in generated_modules}
    return {
        "legacy": sorted(legacy),
        "generated": sorted(generated),
        "only_legacy": sorted(legacy - generated),
        "only_generated": sorted(generated - legacy),
    }


def score_against_gold(
    fixture: str | None, generated_modules: list[dict[str, Any]]
) -> float | None:
    """Return mean Hungarian-alignment similarity for a registered fixture."""
    gold = GOLD_MODULE_FIXTURES.get((fixture or "").casefold())
    if not gold or not generated_modules:
        return None
    try:
        from scipy.optimize import linear_sum_assignment
    except ImportError as exc:
        raise RuntimeError("scipy is required for module gold alignment") from exc

    model = get_embedding_model()
    gold_vectors = model.encode(
        [module["description"] for module in gold], normalize_embeddings=True
    )
    generated_vectors = model.encode(
        [str(module["description"]) for module in generated_modules], normalize_embeddings=True
    )
    similarities = gold_vectors @ generated_vectors.T
    rows, columns = linear_sum_assignment(-similarities)
    return round(float(similarities[rows, columns].mean()), 4) if len(rows) else None
