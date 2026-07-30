# Task-Conditioned Extraction Pipeline — Implementation Plan

Fix grounding decay on long specs by replacing raw `spec_text` / flat chunks
with a two-stage pipeline: ingestion tags every bullet/sentence with a *role*
and a *module* at upload time; generation filters down to only what the prompt
type needs.

---

## Open Questions — Confirm Before Phase 1

1. **Persistence scope**: The "Item store" is described as persisted, but the
   project has no database. Should items be held in-process (dict keyed by a
   session/upload id) or written to a temp file on disk? In-process is simpler
   and fits the current architecture but items are lost on server restart.
   **Recommendation**: start in-process (a module-level `dict[str, list[Item]]`
   keyed by `spec_hash`), add disk persistence later if needed.
   
2. **`sentence-transformers` dependency**: `all-MiniLM-L6-v2` (~90 MB download
   on first use). This is the largest new dependency. Confirm it's acceptable.
   If not, a pure keyword fallback (similar to existing
   `detect_modules_from_chunks`) can substitute for module tagging, with only
   role tagging using embeddings.

3. **docx heading styles**: `docx_reader.py` currently flattens all paragraphs
   to plain text, discarding `p.style.name`. Phase 1 needs raw `Document`
   objects to read heading levels. Should `extract_text_from_docx` be extended
   to also return `Document`, or should a parallel `extract_doc_from_bytes`
   function be added? **Recommendation**: parallel function — no breaking change.

4. **Token budget unit**: The architecture mentions "trim to a token budget".
   The project has no tokenizer. Use character count as a proxy (≈4 chars per
   token) for now and swap in `tiktoken` later? Confirm.

5. **Module name alignment**: no fixed global module taxonomy is carried into
   Phase 4. Generated module names are spec-local and must not be compared as
   exact strings with legacy labels such as `"Search & Filtering"` or
   `"CRUD Operations"`. Any comparison is semantic/alignment-based and is
   observability only until Phase 5 has an explicit plan-to-module mapping.

6. **One deviation from the spec**: the architecture says "persist tagged Items
   (the Item store)" without defining invalidation. Re-ingesting the same spec
   bytes should be a no-op (keyed by `sha256(file_bytes)`). Correct?

---

## Proposed Changes

### Layer map (reading order for each phase)

```
utils/docx_reader.py          ← Phase 1 (extend)
utils/chunker.py              ← Phase 1 (extend), Phase 2
services/ingestion/           ← NEW package, Phases 2–4
services/ingestion/__init__.py
services/ingestion/items.py   ← Item dataclass + store (Phase 2)
services/ingestion/tagger.py  ← tag_role / tag_module (Phases 3–4)
services/ingestion/manifest.py← TASK_MANIFEST + filter (Phase 5–6)
services/spec_service.py      ← wired in Phase 5–6
routers/test_plans.py         ← wired in Phase 5
routers/test_cases.py         ← wired in Phase 6
prompts/test_plan_prompt.py   ← signature change Phase 5
prompts/test_case_prompt.py   ← signature change Phase 6
requirements.txt              ← sentence-transformers added Phase 3
```

---

## Phase 1 — Recursive Heading-Aware Chunking

**Goal**: replace `split_by_headings` (regex-based, flat) with
`chunk_spec_recursive` that reads actual python-docx heading levels and falls
back to a paragraph-window splitter when headings are absent.

### Done looks like
- On a headed spec: chunks carry `heading_path` like
  `["2. Users", "2.1 Registration"]`, never `["General"]`.
- On a plain-text spec (no headings): chunks fall back to fixed-window
  paragraphs, still have `id` and `heading_path = []`.
- `split_by_headings` still works (not deleted); `chunk_spec` in
  `spec_service.py` is switched to call `chunk_spec_recursive`.
- Smoke test: `python -c "from utils.chunker import chunk_spec_recursive; ..."`
  on a real .docx prints chunk ids, heading paths, char counts.

### [MODIFY] [docx_reader.py](file:///d:/stage/testFlow/python-2026/utils/docx_reader.py)

Add a parallel function that returns the raw `Document` object so the chunker
can inspect paragraph styles without changing the existing plain-text API.

```python
def extract_doc_from_bytes(file_bytes: bytes) -> "docx.Document":
    """
    Return the raw python-docx Document for style-aware processing.
    Raises RuntimeError on import or parse failure.
    """
```

### [MODIFY] [chunker.py](file:///d:/stage/testFlow/python-2026/utils/chunker.py)

```python
from dataclasses import dataclass, field

@dataclass
class SpecChunk:
    id: str                          # "CHUNK-001"
    title: str                       # leaf heading text or "General"
    heading_path: list[str]          # ["H1 text", "H2 text", ...]
    text: str                        # body text of the chunk
    char_count: int = field(init=False)

    def __post_init__(self) -> None:
        self.char_count = len(self.text)


def chunk_spec_recursive(
    doc_or_text: "docx.Document | str",
    max_chunk_chars: int = 2200,
) -> list[SpecChunk]:
    """
    Walk python-docx heading styles (Heading 1..6) to build a heading_path
    per leaf section.  Falls back to split_by_headings-style paragraph
    windowing when:
    - input is a plain str (no Document available), or
    - the Document contains fewer than 2 distinct heading paragraphs.
    Each returned SpecChunk carries a full heading_path for downstream tagging.
    Never depends on heading naming conventions; uses p.style.name matching
    'Heading [1-6]'.
    """
```

`split_by_headings` and `detect_modules_from_chunks` are **not deleted** —
they remain for backward compatibility and Phase 4 comparison.

### [MODIFY] [spec_service.py](file:///d:/stage/testFlow/python-2026/services/spec_service.py)

```python
def chunk_spec(spec_text: str) -> list[SpecChunk]:
    """Now delegates to chunk_spec_recursive(spec_text)."""
```

Return type changes from `list[dict]` to `list[SpecChunk]` — callers
(`plan_service.py`, `case_service.py`) only read `.get('title')` and
`.get('text')`, so add `__getitem__` shim or update callers.
**Recommendation**: update callers directly (2 files, 2 call sites each).

### Sanity check
```bash
python -c "
from utils.docx_reader import extract_doc_from_bytes
from utils.chunker import chunk_spec_recursive
data = open('myspec.docx','rb').read()
doc = extract_doc_from_bytes(data)
chunks = chunk_spec_recursive(doc)
for c in chunks:
    print(c.id, c.heading_path, c.char_count)
"
```
Expected: heading paths reflect the spec's TOC; no chunk `>2500` chars;
at least one chunk per major heading.

---

## Phase 2 — Itemization (expand_section_to_items)

**Goal**: split each `SpecChunk` into atomic bullet/sentence `Item`s; build an
in-process Item store keyed by `spec_hash`.

### Done looks like
- A 50-chunk spec produces N items (expect 3–15 items per chunk on average).
- Each item has `source_chunk_id` and `heading_path` traceable back to its
  chunk.
- Store is populated by `ingest_spec()`; retrievable by `get_items(spec_hash)`.
- Smoke: call `ingest_spec(doc, spec_text)` and `print(len(get_items(h)))`.

### [NEW] services/ingestion/__init__.py
Empty.

### [NEW] services/ingestion/items.py

```python
from dataclasses import dataclass, field

ROLE_LABELS = [
    "CONTEXT", "ACTOR", "FEATURE", "REQUIREMENT",
    "ACCEPTANCE", "NON_FUNCTIONAL", "OUT_OF_SCOPE", "GLOSSARY",
]

@dataclass
class Item:
    id: str                     # "ITEM-00042"
    source_chunk_id: str        # "CHUNK-007"
    heading_path: list[str]     # inherited from SpecChunk
    text: str
    role: str = "UNTAGGED"      # one of ROLE_LABELS or "UNTAGGED"
    module: str = "UNTAGGED"    # e.g. "Authentication"
    role_score: float = 0.0     # cosine similarity used for tagging
    module_score: float = 0.0


# ---------------------------------------------------------------------------
# In-process store (spec_hash -> list[Item])
# ---------------------------------------------------------------------------
_STORE: dict[str, list[Item]] = {}


def store_items(spec_hash: str, items: list[Item]) -> None:
    """Overwrite the item list for this spec hash."""

def get_items(spec_hash: str) -> list[Item]:
    """Return items for spec_hash, or [] if not ingested."""

def spec_hash(file_bytes: bytes) -> str:
    """sha256 hex digest of raw file bytes."""


def expand_section_to_items(chunk: "SpecChunk") -> list[Item]:
    """
    Split a SpecChunk into atomic Items at bullet/sentence granularity.
    Strategy (in order):
    1. Split on bullet markers (-, *, •, digits followed by . or )).
    2. Split remaining prose by sentence boundary ('. ' after >=20 chars).
    3. Drop items shorter than 10 chars.
    Each Item inherits source_chunk_id and heading_path from its chunk.
    """
```

### [NEW] services/ingestion/ingest.py

```python
def ingest_spec(
    doc_or_text: "docx.Document | str",
    file_bytes: bytes,
) -> tuple[str, list[Item]]:
    """
    Full ingestion pipeline (Phase 2: itemization only).
    1. chunk_spec_recursive(doc_or_text) -> list[SpecChunk]
    2. expand_section_to_items(chunk) for each chunk -> flat list[Item]
    3. store_items(hash, items)
    Returns (spec_hash, items).
    Call once per uploaded .docx; idempotent (re-hash check).
    """
```

### [MODIFY] [test_plans.py router](file:///d:/stage/testFlow/python-2026/routers/test_plans.py)

In `upload_spec`: after extracting `spec_text`, call `ingest_spec(doc, file_bytes)`
and return `item_count` alongside `spec_text`. The frontend doesn't need this
field; it's for observability only.

> [!NOTE]
> At this phase `ingest_spec` only itemizes — no tagging yet. The existing
> generation path is unchanged.

### Sanity check
Add a temporary `GET /debug/items/{spec_hash}` endpoint (or just a `print`)
that returns `{"item_count": N, "sample": items[:5]}`. Verify bullet splits
look correct on your real spec.

---

## Phase 3 — Role Classifier (tag_role, log-only)

**Goal**: classify each Item's `role` using a lexical-first cascade —
regex → heading-based prior → embedding fallback — not embedding alone.
Log tags but do not filter prompts yet.

**Note on scope**: `tag_module` is intentionally **not** part of this phase.
The original draft used a fixed global `MODULE_DESCRIPTIONS` list (which
still contained the two known stale labels, `Users` and `CRUD Operations`).
A per-spec module vocabulary is planned separately (module generation at
ingestion, one LLM call over CONTEXT+FEATURE items per spec) — building
`tag_module` against a fixed list now means throwing it away shortly after.
Role tagging only in this phase.

### Done looks like
- After ingestion, every item has `role` set to one of the 8 labels, or
  `UNTAGGED` if all three cascade stages fail to reach threshold.
- Every item also has `role_method` logged (`"regex"`, `"heading"`,
  `"embedding"`, or `"none"`) — needed so the log-only phase is actually
  diagnostic, not just a final distribution with no way to tell which
  signal produced it.
- A debug endpoint / log line shows role distribution **and** the
  per-method breakdown (e.g. "regex resolved 60%, heading resolved 8%,
  embedding resolved 22%, UNTAGGED 10%").
- No change to generation output.

### [MODIFY] requirements.txt

```
sentence-transformers>=2.7,<3
```

> [!IMPORTANT]
> Multilingual model required — an English-only model was tested earlier on
> this project's French specs and produced near-random role/module accuracy
> (10.7% / 22.7%). First `ingest_spec` call triggers model download. Use
> lazy loading (`functools.lru_cache`) so the server starts instantly.

### [NEW] services/ingestion/role_rules.py

Lexical/regex layer — the primary signal, not a fallback. Port directly
from the validated notebook classifier rather than re-deriving patterns.

```python
import re

# Order matters within this layer: first match wins.
ROLE_REGEX_RULES: list[tuple[str, re.Pattern]] = [
    ("REQUIREMENT",    re.compile(r"\b(shall|must|doit|devra)\b", re.I)),
    ("ACCEPTANCE",     re.compile(r"^\s*(UC-\d+|CA-\d+|given|when|then|étant donné)", re.I)),
    ("NON_FUNCTIONAL", re.compile(r"<tightened pattern — see note below>")),
    ("ACTOR",          re.compile(r"^\s*(Utilisateur|Administrateur|Équipe)\s+\S+\s*:", re.I)),
    ("GLOSSARY",       re.compile(r"<term-definition pattern>")),
    ("OUT_OF_SCOPE",   re.compile(r"\b(hors[- ]p[ée]rim[eè]tre|out of scope|non couvert)\b", re.I)),
]

def match_regex(text: str) -> str | None:
    """Returns the first matching role, or None if nothing matches."""
```

> [!WARNING]
> NON_FUNCTIONAL must be tightened before use. Confirmed on real data: the
> original bare numeric+unit pattern over-matches REQUIREMENT sentences
> that merely contain a number (audio quality tiers, crossfade duration).
> Require explicit constraint/threshold phrasing, not just number+unit
> presence. Separately: one confirmed miss ("edge cases must be explicitly
> tested", true ACCEPTANCE) matched this rule with no numeric content at
> all — trace what actually fired before assuming it's the same bug.

### [NEW] services/ingestion/role_heading_prior.py

```python
HEADING_KEYWORDS: dict[str, list[str]] = {
    "ACTOR":    ["utilisateur", "acteur", "persona", "stakeholder"],
    "GLOSSARY": ["glossaire", "définitions", "terminologie", "glossary"],
    "CONTEXT":  ["contexte", "présentation", "aperçu", "overview"],
}

def match_heading(nearest_heading_text: str) -> str | None:
    """
    Deterministic keyword match against the item's NEAREST parent heading
    only — not the full heading_path. Matching against every ancestor risks
    an item under, e.g., "Critères d'acceptation" nested inside "Exigences"
    picking up the wrong signal from the outer heading. Returns None if no
    keyword matches; does not fall back to fuzzy matching — that's a
    separate, later cascade stage.
    """
```

### [NEW] services/ingestion/role_embedding_fallback.py

```python
from functools import lru_cache

EMBEDDING_MODEL_NAME = "paraphrase-multilingual-MiniLM-L12-v2"
ROLE_THRESHOLD = 0.30   # avg cosine similarity to nearest labeled examples
K_NEIGHBORS = 5

@lru_cache(maxsize=1)
def _get_model():
    from sentence_transformers import SentenceTransformer
    return SentenceTransformer(EMBEDDING_MODEL_NAME)

@lru_cache(maxsize=1)
def _get_labeled_examples() -> tuple[list[str], list[str]]:
    """
    Loads the existing ~75-item gold set (SonicWave eval) as (texts, roles),
    embeds once, caches for process lifetime.

    Deliberately NOT one hand-written description vector per role. Role is
    a grammatical/functional class, not a topic cluster — validated: a
    description-vector approach scored 13.3% role accuracy vs 66.7% for the
    lexical-first cascade, because two REQUIREMENT sentences on unrelated
    topics share almost no vocabulary and sit far apart in embedding space
    despite the same role. Real labeled sentences give the model actual
    sentence-level context to compare against instead.
    """

def match_embedding(text: str) -> tuple[str | None, float]:
    """
    Embeds `text`, finds the K_NEIGHBORS nearest labeled examples by cosine
    similarity, returns the majority role among them if average similarity
    clears ROLE_THRESHOLD, else (None, score).
    """
```

### [MODIFY] services/ingestion/tagger.py

```python
def tag_role(items: list[Item]) -> list[Item]:
    """
    Cascade, per item, first hit wins:
      1. match_regex(item.text)                    -> role_method = "regex"
      2. match_heading(item.nearest_heading_text)   -> role_method = "heading"
      3. match_embedding(item.text)                 -> role_method = "embedding"
      4. none of the above                          -> role = "UNTAGGED",
                                                         role_method = "none"
    Sets item.role, item.role_score (None for regex/heading — deterministic,
    not scored), item.role_method. Returns items.
    """
```

### [MODIFY] services/ingestion/ingest.py

```
... -> items -> tag_role(items) -> store_items(...)
```

(`tag_module` removed from this pipeline stage — see scope note above.)

```python
log_event(logger, "ingestion_complete",
    spec_hash=h, item_count=len(items),
    role_dist={r: sum(1 for i in items if i.role == r) for r in ROLE_LABELS},
    method_dist={m: sum(1 for i in items if i.role_method == m)
                 for m in ("regex", "heading", "embedding", "none")})
```

### Sanity check

- `UNTAGGED` rate should be well under the ~13% observed pre-fix in the
  notebook eval. If it's higher, something regressed — don't just lower
  `ROLE_THRESHOLD` to compensate; check the method breakdown first.
- Method breakdown should roughly track the earlier finding: regex resolves
  the large majority, heading resolves a small targeted slice
  (ACTOR/GLOSSARY/CONTEXT), embedding covers the genuine remainder. If
  embedding is resolving more than ~25–30% of items, the regex/heading
  layers are under-firing — fix those before trusting the embedding numbers.
- `REQUIREMENT` should be the largest bucket.
- Sample 5 items per role manually, **including `role_method`** — verify
  both the label and the signal that produced it make sense.
- If the test upload is the SonicWave spec, run the existing bucket-scoring
  script from `probe_classifier.ipynb` against this real pipeline output —
  first chance to validate against actual output instead of
  notebook-simulated predictions.

---

## Phase 4 — Module Generation & Classification vs. detect_modules_from_chunks

**Goal**: generate a per-spec module list (not a fixed global one), classify
items against it, and validate quality against the legacy
`detect_modules_from_chunks` output and a small
hand-authored gold set — not just agreement between two heuristics that
share the same flawed taxonomy.

**Execution gate**: complete Phase 3's multilingual embedding fallback and
make its lazy model loader reusable before implementing `module_tagger.py`.
The current deterministic-only role tagger is sufficient to assemble evidence
items, but it cannot supply the embedding similarity required for module
classification. Module generation/alignment may be prototyped independently;
hard module-based filtering must remain disabled until this gate and gold
calibration are complete.

**Note on scope**: this phase builds what Phase 3's revision deferred.
Comparing generated modules with a fixed legacy taxonomy only made sense while both drew from the
same fixed candidate list; that list is retired (module vocabulary doesn't
transfer across specs — validated separately). So this phase does two
things, not one: (1) implement generation + classification, (2) validate
it. Re-upload/versioning stability (re-matching modules across spec
versions) is explicitly deferred past this phase — flag it, don't build it
here.

### Done looks like
- `generate_module_list()` produces an evidence-scaled number of
  `{name, description}` modules (1–12; no artificial floor of 6) from the
  spec's CONTEXT, FEATURE, REQUIREMENT, and NON_FUNCTIONAL items. It excludes
  ACTOR, GLOSSARY, and OUT_OF_SCOPE items and never receives full `spec_text`.
  REQUIREMENT must be included: the SonicWave gold set has no FEATURE examples
  and most functional-module evidence lives in REQUIREMENT items.
- `tag_module()` classifies every item against *that spec's* generated
  list, not a global one.
- A comparison log/endpoint shows: legacy-detector modules, generated+
  classified modules, diff (`only_legacy`, `only_generated`). The current
  `detect_modules_from_chunks()` implementation returns a placeholder
  (`"Core Functionality"`), so this diff is diagnostic only until a real
  legacy detector exists; it is not a keyword-quality signal.
- A small gold-authored module list exists for at least the SonicWave spec;
  generated output is scored against it via alignment matching (Hungarian
  match generated↔gold, then score) — this is the actual correctness
  check. The legacy-detector diff is a secondary, directional signal only
  once that detector has a real implementation.
- A min-items-per-module check flags likely segmentation drift (a real
  module split into two by the LLM) for manual review.
- `detect_modules_from_chunks` is **not removed**; kept as baseline.

### [NEW] services/ingestion/module_generation.py

```python
def generate_module_list(module_evidence_items: list[Item]) -> list[dict]:
    """
    One LLM call over CONTEXT + FEATURE + REQUIREMENT + NON_FUNCTIONAL items
    only (same grounding-decay guard as everywhere else — never full
    spec_text). Apply a fixed character/item budget with per-heading diversity
    before the call. Returns 1-12 {"name": str, "description": str} module
    cards, specific to this spec. The prompt must permit fewer modules for a
    small spec and require every module to cite supporting item IDs; this avoids
    forcing six hallucinated modules when the source has less evidence.
    """

def flag_tiny_modules(modules: list[dict], items: list[Item], min_items: int = 2) -> list[str]:
    """
    Returns names of generated modules with fewer than min_items assigned
    items — likely over-segmentation (one real module split into several).
    Does not auto-merge in this phase; flag for manual review only.
    """
```

> [!NOTE]
> Re-upload stability (fuzzy-matching a new spec version's generated
> modules against previously stored ones, so `module_id` traceability
> survives across versions) is real work and explicitly out of scope here.
> Flag it as a known gap, don't build it into this phase.

### [NEW] services/ingestion/module_tagger.py

```python
MODULE_THRESHOLD = None  # do not enable hard module filtering until calibrated

def tag_module(items: list[Item], module_list: list[dict]) -> list[Item]:
    """
    Classifies each item against module_list (this spec's generated
    modules, not a global fixed list). Primary signal: embedding
    similarity between item text and each module's generated description
    (these descriptions are spec-derived, not the hand-written generic
    ones from the retired fixed list — expect a stronger signal here than
    the original Phase 3 draft got for role).
    Secondary signal: if a module's generated name appears in the item's
    nearest heading text, boost that module's score (mirrors the role
    heading prior, same rationale).
    Sets item.module, item.module_score. Returns items. Until the threshold is
    calibrated against the SonicWave alignment evaluation, retain low-score
    results as UNTAGGED/supporting context rather than using them to exclude
    material from a generation prompt.
    """
```

### [MODIFY] services/ingestion/ingest.py

```python
def compare_module_detection(
    items: list[Item],
    generated_modules: list[dict],
) -> dict:
    """
    Returns {"legacy": [...], "generated": [...], "only_legacy": [...],
    "only_generated": [...]} for comparison logging. Called once at the
    end of ingest_spec in DEBUG mode only.
    """

def score_against_gold(spec_hash: str, generated_modules: list[dict]) -> float | None:
    """
    If a hand-authored gold module list exists for this named fixture/spec hash
    (initially SonicWave), Hungarian-match generated modules against gold and
    return an alignment score. The gold registry must support a named fixture
    because a re-exported DOCX changes its SHA-256 despite representing the
    same SonicWave specification. Returns None if no gold list is registered;
    this check only runs where ground truth exists and never blocks ingestion.
    Add an explicit Hungarian-assignment dependency (scipy) or a tested local
    implementation before this function is added.
    """
```

No production code path changes from the comparison/scoring calls
themselves; both are observability/validation only. `generate_module_list`
and `tag_module` DO sit in the production path (ingestion needs their
output), the comparison logging does not.

### Sanity check
- Run against SonicWave first — it's the only spec with a gold list.
  `score_against_gold` is the number that decides whether this approach is
  trustworthy, not keyword-vs-generated agreement.
- `flag_tiny_modules` output should be empty or near-empty on SonicWave; if
  not, tighten the generation prompt's count bound before trusting output
  on a spec with no gold list to catch it.
- Do not interpret the legacy-detector diff as a quality score while its
  implementation remains the `"Core Functionality"` placeholder. Check the
  gold alignment first, then use the diff only after a real baseline exists.
- Check the diff for cases like the original `"Payments"` /
  `"Billing Flow"` scenario — confirm the generated module now names
  itself after the spec's own vocabulary rather than needing to match a
  preset label. This is the scenario the generative approach is supposed
  to solve structurally; if it's still mismatching here, something's off.
- Do not adopt a blind "> X% agreement = trustworthy" threshold the way the
  original draft did. If a numeric bar is wanted for the keyword-diff
  signal, calibrate it against the gold alignment score on SonicWave first
  — same reasoning already applied to `ROLE_THRESHOLD`.

---

## Phase 5 — Wire TASK_MANIFEST into /generate-plan

**Goal**: replace the `spec_chunks[:10]` slice in `build_test_plan_prompt`
with a filtered, token-budgeted set of Items; measure token reduction.

### Done looks like
- `POST /generate-plan` response is unchanged (same JSON shape).
- Server logs: `prompt_chars_before=XXXX  prompt_chars_after=YYYY`.
- Manually compare generated plans quality vs. pre-change baseline on a long spec.

### [NEW] services/ingestion/manifest.py

```python
from dataclasses import dataclass

TASK_MANIFEST: dict[str, set[str]] = {
    "generate-plan":        {"CONTEXT", "FEATURE", "ACTOR"},
    "generate-test-cases":  {"FEATURE", "REQUIREMENT", "ACCEPTANCE"},
    "ai-decide":            {"FEATURE", "REQUIREMENT"},   # future
}

TOKEN_BUDGET_CHARS: dict[str, int] = {
    "generate-plan":       6_000,   # ~1500 tokens
    "generate-test-cases": 8_000,
}


def filter_items(
    items: list[Item],
    task: str,
    module: str | None = None,
    budget_chars: int | None = None,
) -> list[Item]:
    """
    1. Keep items whose role ∈ TASK_MANIFEST[task].
    2. If module is provided, further restrict to items where item.module == module
       OR item.role in {"CONTEXT", "ACTOR"} (global context always included).
    3. Sort by role_score DESC so highest-confidence items are kept when trimming.
    4. Trim to budget_chars (cumulative item.text length).
    Returns filtered list.  Raises KeyError if task not in TASK_MANIFEST.
    """
```

### [MODIFY] [spec_service.py](file:///d:/stage/testFlow/python-2026/services/spec_service.py)

```python
def get_filtered_items_for_task(
    spec_hash: str,
    task: str,
    module: str | None = None,
) -> list[Item]:
    """
    Convenience wrapper: get_items(spec_hash) -> filter_items(...).
    Returns [] if spec_hash not found (fallback to old path).
    """
```

### [MODIFY] [plan_service.py](file:///d:/stage/testFlow/python-2026/services/plan_service.py)

In `generate_test_plans`: add an `spec_hash: str = ""` kwarg.

```python
def generate_test_plans(
    *,
    spec_text: str,
    style_config: str,
    project_title: str,
    spec_hash: str = "",          # NEW
) -> list[dict]:
    ...
    filtered = get_filtered_items_for_task(spec_hash, "generate-plan")
    use_items = bool(filtered)    # False -> fall back to old chunks path

    prompt = build_test_plan_prompt(
        project_title=project_title,
        style_config=style_config,
        modules=modules,
        requirements=requirements,
        spec_chunks=chunks,       # kept as fallback
        filtered_items=filtered,  # NEW — prompt builder prefers this
    )
```

### [MODIFY] [test_plan_prompt.py](file:///d:/stage/testFlow/python-2026/prompts/test_plan_prompt.py)

```python
def build_test_plan_prompt(
    *,
    project_title: str,
    style_config: str,
    modules: list[str],
    requirements: list[dict],
    spec_chunks: list[SpecChunk],      # fallback
    filtered_items: list[Item] = (),   # NEW — preferred when non-empty
) -> str:
    """
    If filtered_items is non-empty, build the SPECIFICATION block from
    Item.text joined by newlines (role-annotated: '## FEATURE\n- text').
    Otherwise fall back to the existing spec_chunks[:10] slice.
    """
```

### [MODIFY] [test_plans.py router](file:///d:/stage/testFlow/python-2026/routers/test_plans.py)

Pass `spec_hash` (computed at upload or re-computed from bytes in `generate_plan`)
to `generate_test_plans`.

```python
from services.ingestion.items import spec_hash as compute_hash
...
h = compute_hash(file_bytes)
plans = generate_test_plans(spec_text=..., spec_hash=h, ...)
```

> [!NOTE]
> If `spec_hash` not found in store (e.g., server restarted), `filter_items`
> returns [] and the old path runs transparently. No error.

### Sanity check
- Log `prompt_chars_before` (len of old prompt) and `prompt_chars_after`.
- On a 10 000-char spec, expect after < 30% of before.
- Test plan titles should still match spec features (manual check).

---

## Phase 6 — Extend Filtering to /generate-test-cases with Module Scoping

**Goal**: scope item filtering to the module associated with the requested TP-N.

### Done looks like
- Generating test cases for `TP-2 (Authentication)` only sees Authentication
  items + global CONTEXT/ACTOR items — not Payments items.
- Log shows `filtered_item_count` and `module_scope` per call.

### [MODIFY] [case_service.py](file:///d:/stage/testFlow/python-2026/services/case_service.py)

```python
def generate_test_cases(
    *,
    spec_text: str,
    plan: dict,
    style_config: str,
    spec_hash: str = "",           # NEW
) -> list[dict]:
    """
    Derives module scope from plan["title"] (or plan["module"] if present)
    by matching against MODULE_DESCRIPTIONS keys, then calls
    get_filtered_items_for_task(spec_hash, "generate-test-cases", module=scope).
    Falls back to old path if no items found.
    """
```

### [MODIFY] [test_case_prompt.py](file:///d:/stage/testFlow/python-2026/prompts/test_case_prompt.py)

Same pattern as `build_test_plan_prompt`: accept `filtered_items=()`, prefer
over raw chunks when non-empty.

### [MODIFY] [test_cases.py router](file:///d:/stage/testFlow/python-2026/routers/test_cases.py)

Pass `spec_hash` from request body (add optional field to
`GenerateTestCasesRequest` schema) or re-compute from `spec_text` bytes if
not present.

### [MODIFY] schemas/test_case_schema.py

```python
class GenerateTestCasesRequest(BaseModel):
    ...
    spec_hash: str = ""   # NEW optional field
```

### Sanity check
- Generate test cases for two different plans on a multi-module spec; verify
  the items logged for each differ (different modules in scope).
- Check that CONTEXT/ACTOR items appear in both (they bypass module filter).

---

## Phase 7 — Threshold Tuning + UNTAGGED Handling

**Goal**: quantify classifier accuracy; decide what to do with UNTAGGED items.

### Done looks like
- `UNTAGGED` rate < 10 % on a representative spec.
- Policy for UNTAGGED items is explicit and configurable.
- Optionally: one batched LLM pass repairs residual UNTAGGED items.

### [MODIFY] services/ingestion/tagger.py

Add tunable thresholds as env-configurable constants:

```python
ROLE_THRESHOLD   = float(os.getenv("ITEM_ROLE_THRESHOLD",  "0.30"))
MODULE_THRESHOLD = float(os.getenv("ITEM_MODULE_THRESHOLD","0.25"))
```

Add an optional LLM repair pass (disabled by default):

```python
def repair_untagged(
    items: list[Item],
    *,
    max_batch: int = 20,
    enabled: bool = False,
) -> list[Item]:
    """
    Collect UNTAGGED items (up to max_batch), build a single prompt asking
    the LLM to classify each as one of ROLE_LABELS, parse the response,
    and update item.role.  Only called if enabled=True and
    len(untagged) > 0.  Never called per generation — only at ingestion.
    """
```

### [MODIFY] services/ingestion/manifest.py

Add fallback: if after filtering by role the result is empty, fall back to
all items (prevents silent empty context):

```python
def filter_items(...) -> list[Item]:
    ...
    if not result:
        # graceful degradation: return all items trimmed to budget
        result = sorted(items, key=lambda i: i.role_score, reverse=True)
    return _trim_to_budget(result, budget_chars)
```

### Sanity check
- Sweep `ROLE_THRESHOLD` from 0.20 to 0.40 on a real spec; print UNTAGGED %.
- Choose the highest threshold that keeps UNTAGGED < 10%.
- If `repair_untagged` is enabled, verify the repaired roles look plausible
  (spot-check 5–10 items).

---

## Conflicts With Good Practice — Direct Feedback

1. **In-process store vs. request/response**: The architecture says "persist the
   Item store". For a FastAPI service without a database, an in-process dict is
   the right first move — do not add SQLite or Redis just for this; that's over
   engineering at this project size.

2. **Embedding model at ingestion**: Loading `all-MiniLM-L6-v2` adds ~300 ms
   to the first request. Use `@lru_cache` and log a warning if model load
   exceeds 5 s. Do not block startup — lazy load on first `ingest_spec` call.

3. **`sentence-transformers` version pin**: The `requirements.txt` is currently
   unversioned. Adding `sentence-transformers>=2.7,<3` is safe but should
   prompt you to pin the rest of the file at the same time (Phase 3 is the
   moment to do it).

4. **`SpecChunk` as dataclass vs. dict**: `plan_service.py` and
   `case_service.py` both call `.get('title')` and `.get('text')` on chunks.
   Switching the return type to a dataclass without updating those two callers
   breaks silently (no AttributeError — `dataclass.get` returns `None`).
   Update the two callers in Phase 1 rather than adding a shim.

5. **The `<s>[INST]...[/INST]` wrapper** in `test_plan_prompt.py` is a
   Llama-2/Mistral chat template — not needed for OpenRouter (which handles
   message roles at the API level). This is pre-existing tech debt; not
   introducing it, not removing it here either — noting it for awareness.

---

## Verification Plan

### Automated (add after Phase 2)
```bash
python -m pytest services/ingestion/tests/ -v
```
Suggested test cases (create `services/ingestion/tests/test_items.py`):
- `expand_section_to_items` on a known string → expected item count
- `filter_items` with known role set → expected subset
- `spec_hash` is stable across calls

### Manual per phase
Each phase section above lists a "Sanity check" command / endpoint to run
before moving to the next phase.

### End-to-end
After Phase 6:
1. Upload a spec with ≥ 3 distinct feature areas.
2. `POST /generate-plan` — check plan count, plan titles match spec.
3. `POST /generate-test-cases` for two different plans — check test cases are
   feature-specific, not cross-contaminated.
4. Compare prompt char counts in logs vs. baseline (expect ≥ 60% reduction).
