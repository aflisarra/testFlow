"""Offline Phase 4 tests; no OpenRouter call or embedding download."""

import numpy as np

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
