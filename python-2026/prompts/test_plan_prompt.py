from __future__ import annotations

from typing import List, Dict


def build_test_plan_prompt(
    *,
    project_title: str,
    style_config: str,
    modules: List[str],
    requirements: List[Dict[str, str]],
    spec_chunks: List[Dict[str, str]],
) -> str:
    """
    Prompt template only.
    Uses ISTQB/IEEE style constraints and forces strict JSON.
    """
    project_block = project_title.strip() or "(not provided)"
    style_block = style_config.strip() or "(none)"

    # Keep payload compact: include requirement snippets per module and top chunks.
    req_lines: List[str] = []
    for r in requirements[:30]:
        req_lines.append(f"- {r.get('id')} [{r.get('module')}] ({r.get('priority')}): {r.get('text')}")

    chunk_lines: List[str] = []
    for ch in spec_chunks[:10]:
        chunk_lines.append(f"## {ch.get('title')}\n{ch.get('text')[:900]}")

    modules_text = ", ".join(modules[:15]) if modules else "Core Functionality"

    example = (
        '{\n'
        '  "test_plans": [\n'
        '    {"id": "TP-1", "title": "Authentication", "description": "Login, logout, sessions, access rules"},\n'
        '    {"id": "TP-2", "title": "CRUD Operations", "description": "Create, edit, delete, data persistence"},\n'
        '    {"id": "TP-3", "title": "Search & Filtering", "description": "Search, filter, sort, pagination"},\n'
        '    {"id": "TP-4", "title": "Error Handling", "description": "Validation, failures, recovery messages"}\n'
        '  ]\n'
        '}\n'
    )

    return (
        "<s>[INST]\n"
        "You are a Senior QA Engineer and Test Analyst.\n"
        "Follow ISTQB and IEEE 829 principles.\n"
        "You MUST use only the provided specification content. Do NOT invent features.\n\n"
        "### Task\n"
        "Generate 4 to 8 SMART, non-overlapping test plans that cover the application.\n"
        "Plans must be feature-level (module/flow level), not field-level.\n\n"
        "### Hard rules\n"
        "- No duplicates.\n"
        "- No overlapping scopes.\n"
        "- Use spec only; if a feature is not in spec, do not include it.\n"
        "- Avoid generic filler titles (e.g., 'General Testing').\n"
        "- Prefer plans aligned to detected modules.\n\n"
        "### Output format (STRICT)\n"
        "- Output ONLY valid JSON.\n"
        "- Output a JSON object with a single key: \"test_plans\".\n"
        "- \"test_plans\" is an array of objects with exactly keys: id, title, description.\n"
        "- id format: TP-1, TP-2, ...\n"
        "- title: 2-5 words, module/flow name.\n"
        "- description: 8-14 words, concrete scope.\n\n"
        "### Example\n"
        f"{example}\n"
        "### Context\n"
        f"- Project: {project_block}\n"
        f"- UI Style Config: {style_block}\n"
        f"- Detected modules: {modules_text}\n\n"
        "### Extracted requirements (subset)\n"
        + "\n".join(req_lines)
        + "\n\n"
        "### Specification chunks (subset)\n"
        + "\n\n".join(chunk_lines)
        + "\n\n"
        "[/INST]"
    )

