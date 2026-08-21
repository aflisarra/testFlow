"""Offline Phase 4 tests; no OpenRouter call or embedding download."""

import numpy as np
import pytest

from services.ingestion import module_tagger
from services.ingestion.items import Item
from services.ingestion.module_generation import (
    flag_tiny_modules,
    generate_module_list,
    select_module_evidence,
)
from services.ingestion.module_validation import compare_module_detection


def _item(
    id_: str,
    role: str,
    text: str,
    path: list[str],
    role_method: str = "regex",
) -> Item:
    return Item(
        id=id_,
        source_chunk_id="CHUNK-001",
        heading_path=path,
        text=text,
        role=role,
        role_method=role_method,  # type: ignore[arg-type]
    )


def test_module_evidence_excludes_non_product_roles() -> None:
    items = [
        _item("ITEM-00001", "CONTEXT", "Music platform overview.", ["Overview"]),
        _item("ITEM-00002", "REQUIREMENT", "The system must support search.", ["Search"]),
        _item("ITEM-00003", "ACTOR", "Premium user details.", ["Users"]),
        _item("ITEM-00004", "GLOSSARY", "DRM definition.", ["Glossary"]),
    ]

    evidence = select_module_evidence(items)

    assert [item.id for item in evidence] == ["ITEM-00001", "ITEM-00002"]


def test_module_evidence_excludes_untrusted_role_assignments() -> None:
    item = _item("ITEM-00001", "FEATURE", "Search tracks.", ["Search"], role_method="none")

    assert select_module_evidence([item]) == []


def test_generated_cards_must_cite_selected_item_ids() -> None:
    evidence = [_item("ITEM-00002", "REQUIREMENT", "The system must support search.", ["Search"])]

    def fake_generate_json(*, prompt: str, timeout: int):
        assert "ITEM-00002" in prompt
        return {
            "modules": [
                {
                    "name": "Search",
                    "description": "Search and filtering workflows.",
                    "source_item_ids": ["ITEM-00002"],
                },
                {
                    "name": "Invented",
                    "description": "Must be rejected because it has no evidence.",
                    "source_item_ids": ["ITEM-99999"],
                },
            ]
        }

    modules = generate_module_list(evidence, generate_json=fake_generate_json)

    assert modules == [
        {
            "id": "MOD-001",
            "name": "Search",
            "description": "Search and filtering workflows.",
            "kind": "functional",
            "source_item_ids": ["ITEM-00002"],
        }
    ]


def test_generation_without_evidence_does_not_call_ai() -> None:
    assert (
        generate_module_list(
            [],
            generate_json=lambda **kwargs: pytest.fail("Empty evidence must not call the AI"),
        )
        == []
    )


@pytest.mark.parametrize("payload", [None, {}, {"modules": "invalid"}, {"modules": []}])
def test_generation_rejects_missing_or_invalid_module_cards(payload) -> None:
    evidence = [_item("ITEM-00002", "REQUIREMENT", "Search tracks.", ["Search"])]

    with pytest.raises(ValueError, match="modules|valid evidence-backed"):
        generate_module_list(evidence, generate_json=lambda **kwargs: payload)


def test_module_generation_uses_plan_timeout(monkeypatch) -> None:
    evidence = [_item("ITEM-00002", "REQUIREMENT", "The system must support search.", ["Search"])]
    captured = {}

    class _Settings:
        openrouter_test_plans_timeout = 321

    def fake_generate_json(*, prompt: str, timeout: int):
        captured.update({"prompt": prompt, "timeout": timeout})
        return {
            "modules": [
                {
                    "name": "Search",
                    "description": "Search workflows.",
                    "source_item_ids": ["ITEM-00002"],
                }
            ]
        }

    monkeypatch.setattr("services.ingestion.module_generation.get_settings", lambda: _Settings())

    generate_module_list(evidence, generate_json=fake_generate_json)

    assert captured["timeout"] == 321


def test_tiny_modules_and_legacy_comparison_are_diagnostic() -> None:
    module = {"name": "Search", "description": "Search", "source_item_ids": ["ITEM-00001"]}
    items = [_item("ITEM-00001", "REQUIREMENT", "Search requirement.", ["Search"])]
    items[0].module = "Search"

    assert flag_tiny_modules([module], items, min_items=2) == ["Search"]
    assert compare_module_detection(["Core Functionality"], [module]) == {
        "legacy": ["Core Functionality"],
        "generated": ["Search"],
        "only_legacy": ["Core Functionality"],
        "only_generated": ["Search"],
    }


class _FakeEmbeddingModel:
    def encode(self, values, normalize_embeddings=True):
        del normalize_embeddings
        return np.ones((len(values), 2), dtype=float)


class _SequencedEmbeddingModel:
    def __init__(self, item_vectors, module_vectors) -> None:
        self._vectors = iter(
            [
                np.asarray(item_vectors, dtype=float),
                np.asarray(module_vectors, dtype=float),
            ]
        )

    def encode(self, values, normalize_embeddings=True):
        del values, normalize_embeddings
        return next(self._vectors)


def test_module_tagger_excludes_non_product_roles_and_uses_cited_source(monkeypatch) -> None:
    requirement = _item("ITEM-00001", "REQUIREMENT", "Search tracks.", ["Search"])
    glossary = _item("ITEM-00002", "GLOSSARY", "Track: a musical work.", ["Glossary"])
    modules = [
        {
            "id": "MOD-001",
            "name": "Search",
            "description": "Search workflows.",
            "kind": "functional",
            "source_item_ids": ["ITEM-00001"],
        }
    ]
    monkeypatch.setattr(module_tagger, "get_embedding_model", lambda: _FakeEmbeddingModel())

    module_tagger.tag_module([requirement, glossary], modules)

    assert requirement.module_ids == ["MOD-001"]
    assert requirement.module_method == "source"
    assert requirement.module_disposition == "assigned"
    assert glossary.module == "UNTAGGED"
    assert glossary.module_disposition == "excluded"


def test_ambiguous_cited_requirement_remains_unassigned(monkeypatch) -> None:
    requirement = _item("ITEM-00001", "REQUIREMENT", "Shared workflow.", ["Shared"])
    modules = [
        {
            "id": "MOD-001",
            "name": "Search",
            "description": "Search.",
            "source_item_ids": ["ITEM-00001"],
        },
        {
            "id": "MOD-002",
            "name": "Payment",
            "description": "Payment.",
            "source_item_ids": ["ITEM-00001"],
        },
    ]
    monkeypatch.setattr(module_tagger, "get_embedding_model", lambda: _FakeEmbeddingModel())

    module_tagger.tag_module([requirement], modules)

    assert requirement.module_ids == []
    assert requirement.module_disposition == "unassigned"
    assert requirement.module_margin == 0.0


def test_empty_module_inputs_return_without_loading_embeddings(monkeypatch) -> None:
    item = _item("ITEM-00001", "REQUIREMENT", "Search tracks.", ["Search"])
    monkeypatch.setattr(
        module_tagger,
        "get_embedding_model",
        lambda: pytest.fail("Empty inputs must not load embeddings"),
    )

    assert module_tagger.tag_module([], [{"name": "Search"}]) == []
    assert module_tagger.tag_module([item], []) == [item]


def test_only_excluded_roles_do_not_load_embeddings(monkeypatch) -> None:
    glossary = _item("ITEM-00001", "GLOSSARY", "Track definition.", ["Glossary"])
    monkeypatch.setattr(
        module_tagger,
        "get_embedding_model",
        lambda: pytest.fail("Excluded roles must not load embeddings"),
    )

    module_tagger.tag_module([glossary], [{"name": "Search", "description": "Search"}])

    assert glossary.module_disposition == "excluded"
    assert glossary.module_ids == []


def test_nfr_cited_by_multiple_modules_is_cross_cutting(monkeypatch) -> None:
    nfr = _item(
        "ITEM-00001",
        "NON_FUNCTIONAL",
        "Every workflow must respond within two seconds.",
        ["Performance"],
    )
    modules = [
        {
            "name": "Search",
            "description": "Search workflows",
            "source_item_ids": [nfr.id],
        },
        {
            "name": "Checkout",
            "description": "Checkout workflows",
            "source_item_ids": [nfr.id],
        },
    ]
    monkeypatch.setattr(module_tagger, "get_embedding_model", lambda: _FakeEmbeddingModel())

    module_tagger.tag_module([nfr], modules)

    assert nfr.module == "CROSS_CUTTING"
    assert nfr.module_ids == ["MOD-001", "MOD-002"]
    assert nfr.primary_module_id is None
    assert nfr.module_disposition == "cross_cutting"


def test_heading_boost_can_select_uncited_module(monkeypatch) -> None:
    item = _item("ITEM-00001", "REQUIREMENT", "Find tracks.", ["Search workflows"])
    modules = [
        {"id": "MOD-001", "name": "Search", "description": "Find tracks"},
        {"id": "MOD-002", "name": "Checkout", "description": "Buy tracks"},
    ]
    model = _SequencedEmbeddingModel([[1.0]], [[0.80], [0.85]])
    monkeypatch.setattr(module_tagger, "get_embedding_model", lambda: model)

    module_tagger.tag_module([item], modules)

    assert item.module == "Search"
    assert item.module_ids == ["MOD-001"]
    assert item.module_method == "hybrid"
    assert item.module_score == 0.88
    assert item.module_disposition == "assigned"


@pytest.mark.parametrize(
    ("score_threshold", "margin_threshold", "module_vectors"),
    [
        (0.9, None, [[0.8], [0.2]]),
        (None, 0.1, [[0.8], [0.75]]),
    ],
)
def test_low_confidence_uncited_item_remains_unassigned(
    monkeypatch,
    score_threshold,
    margin_threshold,
    module_vectors,
) -> None:
    item = _item("ITEM-00001", "REQUIREMENT", "Shared workflow.", [])
    modules = [
        {"id": "MOD-001", "name": "Search", "description": "Search"},
        {"id": "MOD-002", "name": "Checkout", "description": "Checkout"},
    ]
    monkeypatch.setattr(
        module_tagger,
        "get_embedding_model",
        lambda: _SequencedEmbeddingModel([[1.0]], module_vectors),
    )
    monkeypatch.setattr(module_tagger, "MODULE_THRESHOLD", score_threshold)
    monkeypatch.setattr(module_tagger, "MODULE_MARGIN_THRESHOLD", margin_threshold)

    module_tagger.tag_module([item], modules)

    assert item.module == "UNTAGGED"
    assert item.module_ids == []
    assert item.module_disposition == "unassigned"
    assert item.module_score == 0.8
