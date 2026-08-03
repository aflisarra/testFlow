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
   
2. **`sentence-transformers` dependency**: multilingual model
   (`paraphrase-multilingual-MiniLM-L12-v2`) — required because an
   English-only model tested on this project's French specs produced
   near-random accuracy. This is the largest new dependency, and in this
   revision it's needed for **module tagging only** (Phase 4): role
   tagging (Phase 3) is regex + heading only, no embedding fallback and no
   LLM calls, so it pulls in no model dependency of its own. Confirm the
   module-tagging use is acceptable; if not, `detect_modules_from_chunks`'s
   keyword approach remains as a fallback path (kept as baseline
   regardless, see Phase 4).

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
services/ingestion/manifest.py← TASK_MANIFEST + filter (Phase 4b, 5–6)
services/spec_service.py      ← wired in Phase 5–6
routers/test_plans.py         ← wired in Phase 5
routers/test_cases.py         ← wired in Phase 6
prompts/test_plan_prompt.py   ← signature change Phase 5
prompts/test_case_prompt.py   ← signature change Phase 6
requirements.txt              ← sentence-transformers added Phase 4 (module tagging only)
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

**Goal**: classify each Item's `role` using a two-stage deterministic
cascade — regex → heading-based prior — only. No embedding tier and no
LLM calls in this phase: anything neither stage resolves goes to
`UNTAGGED` and on to Phase 5a's human review queue, with no automated
suggestion attached. Log tags but do not filter prompts yet.

> [!NOTE]
> The k-NN embedding fallback from the earlier draft is removed, not
> deferred. It only had validated accuracy as part of the full cascade
> (66.7%), never isolated on the subset only it would resolve — and k-NN
> against a single-domain (~75-example, SonicWave/audio) gold set is
> expected to misgeneralize on specs from other domains, the same
> overfit failure mode that ruled out the description-vector approach
> (13.3% role accuracy) earlier in this same phase. Rather than trust an
> unvalidated, domain-fragile signal, items it would have covered now
> fall straight through to human review instead (Phase 5a).

**Note on scope**: `tag_module` is intentionally **not** part of this phase.
The original draft used a fixed global `MODULE_DESCRIPTIONS` list (which
still contained the two known stale labels, `Users` and `CRUD Operations`).
A per-spec module vocabulary is planned separately (module generation at
ingestion, one LLM call over CONTEXT+FEATURE items per spec) — building
`tag_module` against a fixed list now means throwing it away shortly after.
Role tagging only in this phase.

### Done looks like
- After ingestion, every item has `role` set to one of the 8 labels, or
  `UNTAGGED` if both cascade stages fail to match.
- Every item also has `role_method` logged (`"regex"`, `"heading"`, or
  `"none"`) — needed so the log-only phase is actually diagnostic, not
  just a final distribution with no way to tell which signal produced it.
- A debug endpoint / log line shows role distribution **and** the
  per-method breakdown (e.g. "regex resolved 60%, heading resolved 8%,
  UNTAGGED 32%"). A higher UNTAGGED share than earlier cascade drafts is
  expected — that volume is now Phase 5a's review queue, not lost
  information.
- No change to generation output.

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

### [MODIFY] services/ingestion/tagger.py

```python
def tag_role(items: list[Item]) -> list[Item]:
    """
    Cascade, per item, first hit wins:
      1. match_regex(item.text)                    -> role_method = "regex"
      2. match_heading(item.nearest_heading_text)   -> role_method = "heading"
      3. neither matches                            -> role = "UNTAGGED",
                                                         role_method = "none"
    Sets item.role, item.role_method. Both stages are deterministic —
    item.role_score has no populated signal in this phase and stays at the
    Item dataclass default (0.0); kept on the schema for forward
    compatibility only, not read by any consumer here. Returns items.
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
                 for m in ("regex", "heading", "none")})
```

### Sanity check

- Record the raw `UNTAGGED` rate for regex+heading alone on a real spec
  before deciding anything about it. This number is no longer just a log
  line — it's the actual size of Phase 5a's review queue. Treat a high
  number as real information: the fix is extending `role_rules.py` /
  `HEADING_KEYWORDS` coverage, not adding a scored fallback tier back in.
- `REQUIREMENT` should be the largest bucket among items that do get
  tagged.
- Sample 5 items per role manually, **including `role_method`** — verify
  both the label and the signal that produced it make sense.
  `role_method` should only ever be `"regex"`, `"heading"`, or `"none"`
  at this phase — anything else is a bug.
- If the test upload is the SonicWave spec, run the existing bucket-scoring
  script from `probe_classifier.ipynb` against this real pipeline output.
  Expect a lower resolved-rate than the notebook's cascade-with-embedding
  numbers; that gap is now review-queue volume, not silent
  misclassification, so it isn't itself a regression.

---

## Phase 4 — Module Generation & Classification vs. detect_modules_from_chunks

**Goal**: generate a per-spec module list (not a fixed global one), classify
items against it, and validate quality against the legacy
`detect_modules_from_chunks` output and a small
hand-authored gold set — not just agreement between two heuristics that
share the same flawed taxonomy.

**Execution gate**: `sentence-transformers` is introduced fresh in this
phase — Phase 3's role tagger is regex + heading only and has no
embedding model to reuse. Module generation/alignment may be prototyped
independently; hard module-based filtering must remain disabled until
gold calibration (`score_against_gold`) is complete.

### [MODIFY] requirements.txt

```
sentence-transformers>=2.7,<3
```

> [!IMPORTANT]
> Multilingual model required — an English-only model was tested earlier
> on this project's French specs and produced near-random module accuracy
> (22.7%). First `ingest_spec` call with module tagging enabled triggers
> model download. Use lazy loading (`functools.lru_cache`) so the server
> starts instantly. This is the only `sentence-transformers` consumer in
> the project now — role tagging (Phase 3) doesn't use it.

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
- Evidence selection is also gated on `role_method`, not just `role`: only
  `regex`/`heading`/`human`-tagged items count as evidence (see
  `select_module_evidence()` below). A misclassified item here doesn't
  just cost one prompt — it can seed or blur an entry in the generated
  module list, and every item in the spec is later classified against
  that list via `tag_module()`. That risk is higher than in Phase 5b's
  per-prompt filtering, so evidence selection stays stricter than
  ordinary role filtering.
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
MODULE_EVIDENCE_ROLES = frozenset({"CONTEXT", "FEATURE", "REQUIREMENT", "NON_FUNCTIONAL"})
TRUSTED_METHODS_FOR_EVIDENCE = frozenset({"regex", "heading", "human"})

def select_module_evidence(items: list[Item]) -> list[Item]:
    """
    Evidence for generate_module_list(): role in MODULE_EVIDENCE_ROLES AND
    role_method in TRUSTED_METHODS_FOR_EVIDENCE. The method gate matters
    more here than anywhere else `role` is read — a bad item here can seed
    or blur an entry in the generated module list, and every item in the
    spec is later classified against that list via tag_module(). Since
    Phase 3 has no scored/embedding role tier, this reduces in practice to
    "role_method != 'none'", i.e. UNTAGGED items are excluded — including
    items still sitting in Phase 5a's review queue. Once a UNTAGGED item
    is resolved by a human, role_method becomes "human" and it becomes
    eligible as evidence on the next call, the same mechanism Phase 5b
    uses for prompt filtering.
    """

def generate_module_list(module_evidence_items: list[Item]) -> list[dict]:
    """
    One LLM call over the output of select_module_evidence() only (same
    grounding-decay guard as everywhere else — never full spec_text).
    Apply a fixed character/item budget with per-heading-path diversity
    before the call — cap items per top-level heading_path prefix rather
    than truncating by raw order/length, so one heavily-detailed section
    doesn't crowd out sparser ones the module list still needs to cover.
    Returns 1-12 {"name": str, "description": str} module cards, specific
    to this spec. The prompt must permit fewer modules for a small spec
    and require every module to cite supporting item IDs; this avoids
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
MODULE_THRESHOLD = None  # no hard module filter until calibrated

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
    Sets item.module to the best generated module and records
    item.module_score. Returns items. Until calibration, module scores are
    observational: no low-score item is excluded from a generation prompt.
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
  — the same "don't trust an uncalibrated number" reasoning that led to
  dropping `ROLE_THRESHOLD` outright on the role side (see Phase 7).

---

## Phase 4b — Item identity, manifest, and generation handoff (NEW)

**Goal**: establish the contracts Phase 5 and 6 need before either route
filters stored items. This phase does not change prompt selection and does not
soft-include UNTAGGED items.

### [NEW] services/ingestion/manifest.py

```python
TASK_MANIFEST: dict[str, set[str]] = {
    "generate-plan": {"CONTEXT", "FEATURE", "ACTOR"},
    "generate-test-cases": {"FEATURE", "REQUIREMENT", "ACCEPTANCE"},
}
```

This is the sole role-to-task contract. UNTAGGED items are excluded from both
task candidate sets; their omission is surfaced through the review count, not
reintroduced through soft inclusion.

### [MODIFY] services/ingestion/items.py

```python
ROLE_METHODS = ("regex", "heading", "human", "none")

@dataclass
class Item:
    ...
    role_method: str = "none"
    reviewed: bool = False
    reviewed_by: str | None = None
    suggested_role: str | None = None  # always None in Phase 5a
    requirement_id: str | None = None
```

When an item is tagged or resolved as REQUIREMENT, assign a stable
`requirement_id` derived from its immutable item ID (for example
`ITEM-00042` -> `REQ-00042`). Generation must build its requirement list from
the retained requirement items and these IDs, rather than calling the legacy
whole-document `extract_requirements()` path. This preserves the existing
`REQ-*` response contract without allowing a plan to cite a requirement whose
source item was filtered out.

### [MODIFY] upload and generation contracts

- `POST /upload-spec` returns the additive `spec_hash` field alongside
  `item_count`.
- `POST /generate-plan` accepts an optional `spec_hash`. When a file is sent
  to this endpoint, it must ingest that same byte sequence and use the returned
  hash; when only `spec_text` is sent, missing/unknown hash triggers the
  documented legacy-chunk fallback.
- `GenerateTestCasesRequest` accepts optional `spec_hash` and `plan_module`.
  The caller returns the upload hash and generated plan module unchanged.
- `GeneratePlanResponse` retains `test_plans` and adds
  `pending_review_count`. `TestCasesResponse` retains `test_cases` and adds
  `pending_review_count`. Do not rename either existing collection key.
- Add `module: str | None` to each generated TestPlan. Its value must be one
  of the stored spec-local module names (or null); test-case generation uses
  this explicit value, never title-to-module fuzzy matching.

### [MODIFY] services/ingestion/module_tagger.py

Phase 4 is observational. Select the best generated module for every item and
record its score; do not apply `MODULE_THRESHOLD` to set module UNTAGGED until
gold calibration is complete. Items remain module UNTAGGED only if no module
cards were generated. No prompt filtering may depend on module score in this
phase.

### Done looks like

- A stored requirement item can be traced as `Item -> requirement_id -> plan
  requirement ID` with no whole-document side channel.
- The same uploaded document's `spec_hash` reaches plan and test-case routes.
- Existing clients continue to receive `test_plans` and `test_cases` keys.
- UNTAGGED items remain excluded from task candidates and visible through the
  review count.

---

# Corrections: Phase 5 onward — human review for UNTAGGED items

Replaces Phase 5, 6, 7, Conflict-With-Good-Practice item 1, and adds one
item to the Verification Plan, from the consolidated implementation plan.

## Phase 4c — Durable spec-ingestion persistence in Node/Mongo (NEW)

**Goal**: replace FastAPI's process-local item/module dictionaries with a
durable Node-owned MongoDB store. This is the prerequisite for human review:
a resolution must survive FastAPI and Node process restarts, while FastAPI
remains stateless.

### Storage model

Use two new Mongoose models, rather than embedding every Item in a single
document. A 15 MiB specification can yield enough atomic items to approach
MongoDB's 16 MiB document limit; a separate item collection avoids creating a
size-dependent failure mode.

`SpecIngestion` (`src/models/spec-ingestion.model.js`):

```js
{
  specHash: String,             // sha256 of raw upload bytes; unique
  status: 'writing' | 'ready',
  itemCount: Number,
  modules: [{
    name: String,
    description: String,
    source_item_ids: [String],
  }],                           // max 12, safely bounded
  createdAt: Date,
  updatedAt: Date,
}
```

`SpecIngestionItem` (`src/models/spec-ingestion-item.model.js`):

```js
{
  specHash: String,
  itemId: String,               // Item.id, e.g. ITEM-00042
  sourceChunkId: String,
  headingPath: [String],
  text: String,
  role: String,                 // ROLE_LABELS plus UNTAGGED
  roleMethod: String,           // regex | heading | human | none
  roleScore: Number | null,
  module: String,
  moduleScore: Number,
  reviewed: Boolean,
  reviewedBy: String | null,
  suggestedRole: String | null, // always null in Phase 5a
  requirementId: String | null,
  createdAt: Date,
  updatedAt: Date,
}
```

Indexes:

- unique `{ specHash: 1 }` on `SpecIngestion`;
- unique `{ specHash: 1, itemId: 1 }` on `SpecIngestionItem`;
- `{ specHash: 1, role: 1, reviewed: 1 }` for review-queue reads.

The Mongo field names use Node's camelCase convention; the internal HTTP
contract maps to/from FastAPI's snake_case `Item` fields. `modules` belong on
the ingestion document because their count and evidence list are explicitly
bounded. Module assignments remain on individual items.

### Internal Node API

Add `src/routes/spec-ingestion-internal.routes.js` and mount it at
`/api/internal/spec-ingestions`. These are service-to-service endpoints, not
browser endpoints. Protect every route with a new `requireInternalToken`
middleware which compares `X-Internal-Token` to the configured shared secret
using `crypto.timingSafeEqual`; reject requests if the secret is absent or
does not match. Do not expose these routes through the unauthenticated
`/api/ollama` router.

```text
PUT   /api/internal/spec-ingestions/:specHash
      body: {items: [...], modules: [...]}
      idempotently replaces the ingestion snapshot for this hash.

GET   /api/internal/spec-ingestions/:specHash
      -> {items: [...], modules: [...]} | 404

GET   /api/internal/spec-ingestions/:specHash/review-queue
      -> pending items only

PATCH /api/internal/spec-ingestions/:specHash/items/:itemId/review
      body: {role: "ACTOR", reviewer?: string}
      -> updated item
```

The PUT implementation marks the ingestion `writing`, upserts item rows by
the unique compound index, removes stale rows for the same hash, then writes
the module cards/count and marks it `ready`. GET requests return 404 unless
the ingestion is ready, so FastAPI never observes a partial replacement.
Review PATCH is a single-document atomic update requiring a valid
`ROLE_LABELS` role; it sets `roleMethod: "human"`, `reviewed: true`, records
the optional reviewer, clears `suggestedRole`, and derives `requirementId` when the selected role is
`REQUIREMENT`. It returns 404 for an unknown spec/item and 422 for an invalid
role. The first implementation may accept the complete bounded request body;
if real item payloads exceed Express's JSON limit, add explicit batched PUTs
before raising that limit globally.

### FastAPI adapter

Replace the private `_STORE` and `_MODULE_STORE` implementations with a small
HTTP client in `services/ingestion/store_client.py`, configured with an
explicit Node base URL and the same internal-token header. Add one atomic
write used by `ingest_spec`, while keeping existing read helpers stable:

```python
store_ingestion(spec_hash, items, modules) -> None
get_items(spec_hash) -> list[Item]
get_module_list(spec_hash) -> list[dict]
```

`ingest_spec` must call `store_ingestion()` once after item and module work;
remove its separate `store_items()` / `store_module_list()` writes so they
cannot race. The adapter serializes/deserializes every Item field exactly,
including review metadata and requirement IDs. `get_items()` returns `[]` for
a 404 to retain the documented generation fallback; connection/auth failures
must raise, never masquerade as an empty spec.

`review_queue.py` stops mutating a process-local list. Its pending and
resolve functions call the corresponding internal endpoints (or the shared
adapter functions) so a human decision is durable. The existing FastAPI
review endpoints remain the public review API; the Node endpoints remain
internal implementation detail.

### Verification

- Add Node model/service tests for unique item identity, complete snapshot
  replacement, only-ready reads, and atomic review resolution.
- Add FastAPI adapter tests with mocked Node responses for field round trips,
  404 fallback, and non-404 failure propagation.
- Upload a real document, resolve one UNTAGGED item, restart both services,
  then verify it remains absent from `GET /review-queue/{spec_hash}` and has
  `role_method == "human"` when read again.
- Verify an identical file hash is idempotent and its module cards and item
  assignments can be read after restart.

## Prerequisite (blocks Phase 5a and later): Phase 4c must be complete

The current in-process dictionaries are only a development stand-in. Do not
claim Phase 5a's review resolutions are durable, and do not start Phase 5b,
until the Phase 4c Node/Mongo adapter has replaced them.

---

## Phase 5a — Human review queue for UNTAGGED items (NEW)

**Goal**: every item that falls through Phase 3's cascade (`role ==
"UNTAGGED"`) becomes a durable, resolvable review item instead of a
number in a log line.

### Done looks like
- Every UNTAGGED item is queryable via a review endpoint, with enough
  context (text, heading_path, nearest heading) for a human to decide.
- No automated `suggested_role` in this phase — no LLM calls. The
  reviewer works from raw text + heading_path + nearest_heading and picks
  a role cold. `Item.suggested_role` stays on the dataclass for forward
  compatibility but is always `None` for now; revisit only if the
  regex/heading review queue proves too large to work through by hand —
  that's the trigger to reconsider a hint source, not a reason to add
  one preemptively.
- Resolving an item sets its role permanently and durably; it behaves
  identically to a regex/heading match on every subsequent call.
- No item is ever silently dropped or silently auto-assigned.

### [MODIFY] services/ingestion/items.py

```python
@dataclass
class Item:
    ...
    reviewed: bool = False              # NEW
    suggested_role: str | None = None  # NEW — reserved for a future hint
                                        # source; always None for now, no
                                        # LLM calls in this phase
```

### [NEW] services/ingestion/review_queue.py

```python
def enqueue_for_review(spec_hash: str, items: list[Item]) -> int:
    """
    Called once, immediately after tag_role() in ingest.py (one added line
    at the existing Phase 3 call site — see below). "Pending" needs no new
    state: it's simply role == "UNTAGGED" and reviewed == False, already
    true the moment tag_role finishes.

    No automated suggestion in this phase — no LLM calls, so no added
    ingest-time latency regardless of UNTAGGED count. Each newly-UNTAGGED
    item's `suggested_role` stays None; the reviewer works from text +
    heading_path + nearest_heading alone.
    Returns the count enqueued.
    """

def get_pending_review(spec_hash: str) -> list[Item]:
    """Items with role == 'UNTAGGED' and reviewed == False for this spec."""

def resolve_review(
    spec_hash: str,
    item_id: str,
    role: str,
    reviewer: str | None = None,
) -> Item:
    """
    Human-confirmed resolution. Sets item.role = role,
    item.role_method = "human", item.reviewed = True. Must go through the
    durable store (see prerequisite above) — an in-memory resolution that
    disappears on restart defeats the entire point of this phase.
    Raises ValueError if role not in ROLE_LABELS or item not found.
    """
```

### [NEW] routers/review.py

```
GET  /review-queue/{spec_hash}
     -> [{item_id, text, heading_path, nearest_heading, suggested_role}, ...]

POST /review-queue/{spec_hash}/{item_id}
     body: {"role": "ACTOR"}
     -> resolves the item via resolve_review(); returns the updated Item
```

### [MODIFY] services/ingestion/ingest.py

One additional line at the existing tagging call site from Phase 3:

```
... -> items -> tag_role(items) -> enqueue_for_review(h, items) -> store_items(...)
```

### Sanity check
- Upload a spec with a known ambiguous item (e.g. one of the previously
  confirmed UNTAGGED items from the SonicWave eval). Confirm it appears in
  `GET /review-queue/{spec_hash}` with `suggested_role: null` and enough
  context (text, heading_path, nearest_heading) to resolve it by hand.
- Resolve it via the POST endpoint, restart the server process, call
  `GET /review-queue/{spec_hash}` again — the item must **not** reappear
  as pending. If it does, the durable-storage prerequisite above isn't
  actually wired in yet; stop and fix that before continuing.

---

## Phase 5b — Deterministic `/generate-plan` from the tagged store (corrected)

**Goal**: replace LLM-prompted test-plan generation entirely with a
deterministic builder reading Phase 4's cached module list and Phase 2/3's
tagged Items directly — no `build_test_plan_prompt()` call, no OpenRouter
call, anywhere in this path. `/generate-plan` becomes a data-assembly
endpoint. The only place an LLM call can still fire on this route is
inside `get_or_generate_module_list()` on a cache miss (Phase 4) — that's
module generation, not plan generation, and only on a spec's first call.

**Before implementing — verify against real generated plans, don't assume
from one example**:
1. **Cardinality**: is it consistently one module → one test plan, or does
   the current LLM sometimes split one module into multiple plans (e.g.
   happy path vs. error handling)? If it's not strictly 1:1, that's an
   open design question to resolve explicitly here, not something to force
   into a 1:1 loop silently.
2. **Requirements linkage**: does `extract_requirements()` (or whatever
   currently populates `plan["requirements"]`) produce stable `REQ-N` ids
   at Item granularity — i.e. can a `REQUIREMENT`-role Item be mapped to
   the `REQ-N` id(s) it corresponds to? If that mapping doesn't exist yet,
   it's a small prerequisite to add, not something to fake.
3. **Boilerplate check**: diff `description` / `objective` across 8–10
   real generated plans. Template them only if they're identical modulo
   the module name; if the LLM is writing something more specific per
   plan today, say so instead of flattening it.

### Done looks like
- `POST /generate-plan` returns TP-N records built entirely from stored
  data — same shape as before (`id`, `title`, `description`, `objective`,
  `scope`, `priority`, `requirements`) — plus the existing additive
  `pending_review_count` field (unchanged meaning: count of this spec's
  items still `role == "UNTAGGED"` at call time).
- Modules `flag_tiny_modules()` catches as likely over-segmentation are
  skipped rather than producing a spurious TP-N for them.
- `priority` defaults to `"Medium"` on every generated plan, human-editable
  afterward. No keyword-based priority heuristic — a guess dressed as a
  signal isn't more grounded than no guess, and it's harder for a reviewer
  to notice it's a guess.
- Server logs a before/after comparison against the last LLM-generated
  batch for the same spec (see Sanity check) — this phase removes an LLM
  call from a real path, so it needs a real quality check, not just a
  shape check.

### [NEW] services/plan_service.py

```python
def build_test_plans_deterministic(
    module_list: list[dict],
    items: list[Item],
) -> list[dict]:
    """
    One TP-N per module in module_list, skipping names present in
    flag_tiny_modules(module_list, items). Per module:
      id:          sequential "TP-{i}"
      title:       module["name"]
      scope:       module["description"]  — Phase 4's own generated text;
                   no new boilerplate needed here
      description: templated from module["name"] IFF the boilerplate
                   check above confirmed it's template-safe; otherwise
                   flag explicitly rather than silently templating over
                   real per-plan content
      objective:   same treatment as description
      priority:    "Medium" (constant; human-editable, never guessed)
      requirements: REQ-N ids for REQUIREMENT-role items tagged to this
                   module, via the linkage confirmed in point 2 above
    Returns the list of TP-N dicts.
    """

def generate_test_plans(*, spec_hash: str) -> tuple[list[dict], int]:
    """
    Replaces the prompt-based version entirely for this path.
      items = get_items(spec_hash)
      module_list = get_or_generate_module_list(spec_hash)  # Phase 4,
                    lazy + cached — may pay for one LLM call here on a
                    spec's first call, never after
      plans = build_test_plans_deterministic(module_list, items)
      pending_review_count = sum(1 for i in items if i.role == "UNTAGGED")
    Returns (plans, pending_review_count). No spec_text, style_config, or
    project_title parameters — nothing here is LLM-prompted anymore, so
    those inputs have nothing left to condition.
    """
```

### [MODIFY] routers/test_plans.py

```python
plans, pending_review_count = generate_test_plans(spec_hash=h)
return {"plans": plans, "pending_review_count": pending_review_count}
```

### On `manifest.py` / `TASK_MANIFEST` / `filter_items`

These stay exactly as already built — Phase 6 still needs them — but this
phase **stops calling them**: there's no more LLM prompt for
`/generate-plan` to filter context for. `filter_items()`'s only live
caller after this phase is `/generate-test-cases` (Phase 6). Don't delete
`manifest.py`; just drop the now-unused `"generate-plan"` entry from
`TASK_MANIFEST` rather than leaving an uncalled key sitting in the map.

### `prompts/test_plan_prompt.py`

Retired from the default flow, not deleted outright — kept in case a
manual "regenerate this one plan via LLM" escape hatch is wanted later.
Nothing in the default `/generate-plan` flow calls it anymore.

### Sanity check
- Confirm `/generate-plan` makes zero OpenRouter calls on a cache-hit spec
  (module list already generated) — check request logs, not just output
  shape.
- On a spec's first-ever `/generate-plan` call, confirm exactly one
  OpenRouter call fires (module generation) and one embedding pass runs
  (module tagging) — not two, not on every subsequent call.
- Pull the deterministically-built plans for a real spec side-by-side with
  the last LLM-generated batch for the same spec. Check specifically for
  cases the template can't reach: multi-plan modules (if cardinality
  turned out not to be 1:1), missing `requirements` links, and whether
  `description`/`objective` read noticeably worse without the LLM's
  per-plan phrasing. Any gap here is real signal about whether the
  boilerplate assumption held — not a rubber stamp.
- Upload a spec with a known-ambiguous item left unresolved; confirm
  `pending_review_count > 0` in the response. Resolve it via Phase 5a,
  call `/generate-plan` again: confirm the count drops, and — via Phase
  4's incremental re-tag, not a module-list regeneration — confirm that
  item's `module` field is no longer `"UNTAGGED"`.

---

## Phase 6 — Extend filtering to /generate-test-cases with module scoping (corrected)

**Goal**: unchanged — scope filtering to the module for the requested
TP-N. Only change from the original: this now consumes `filter_items`'s
tuple return, so `pending_review_count` propagates the same way.

### [MODIFY] services/case_service.py

```python
def generate_test_cases(
    *,
    plan_id: str,
    plan_title: str,
    plan_description: str,
    plan_module: str | None,
    spec_text: str,
    style_config: str,
    project_title: str,
    spec_hash: str = "",
) -> tuple[list[dict], int]:
    """
    Uses the explicit ``plan_module`` returned with the selected TestPlan;
    never derives scope from plan title text. Returns
    (test_cases, pending_review_count) — same pattern as Phase 5b.
    """
```

> [!NOTE]
> Module tags are observational in Phase 4: every item receives its
> best-generated module when cards exist, but no module score is used to
> exclude an item. Module review is deferred until a calibrated hard module
> filter is intentionally introduced.

### Sanity check
Same as originally specified, plus: `pending_review_count` is deliberately
the spec-wide unresolved queue count, consistent with Phase 5b. Do not claim
it is task-relevant: an UNTAGGED item has no trustworthy role yet, so task
relevance cannot be computed without guessing.

---

## Phase 7 — Regex/heading coverage tuning (corrected)

**Goal**: with the embedding tier cut (Phase 3) and no automated
`suggested_role` hint (Phase 5a), the UNTAGGED rate is now entirely a
function of `role_rules.py` / `role_heading_prior.py` coverage. This
phase narrows the review queue by improving those two deterministic
layers using real resolved-item data — it is not threshold tuning, since
no scored/numeric tier remains anywhere in the role cascade.

`ROLE_THRESHOLD` and the k-NN tier it gated are deleted, not tuned — they
never ship past Phase 3 in this revision (see Phase 3's note). The
automatic `repair_untagged` LLM pass from the original draft is likewise
deleted outright, with no replacement: there is no LLM auto-tag or
auto-hint path anywhere in the role pipeline, by design. Resolving
UNTAGGED items is a human-only action (Phase 5a).

### [MODIFY] services/ingestion/role_rules.py, role_heading_prior.py

Use Phase 5a's *resolved* items (`role_method == "human"`) as a feedback
source: periodically sample recently-resolved items, group by the role a
human assigned, and look for recurring surface patterns — a phrase, a
heading keyword — that regex/heading currently miss. Promote confirmed
patterns into `ROLE_REGEX_RULES` / `HEADING_KEYWORDS` by hand; this stays
a manual, reviewed code change, not an automated rule-learning step, to
avoid quietly reintroducing the single-spec overfit risk that ruled out
the embedding tier in the first place.

### [MODIFY] services/ingestion/manifest.py

The original draft's empty-result fallback ("if no items match, return
all items sorted by role_score") is **removed**, not fixed — it would
silently reintroduce the exact grounding-decay problem this whole project
exists to solve, and `role_score` has no populated signal for any
role-tagged item in this revision (regex/heading are unscored; no
embedding tier exists to score anything). If `filter_items` returns no
candidates, that's real information: return `([], pending_review_count)`
and let the caller fall back to the old chunks path, same as the
already-established "spec_hash not found" behavior. Don't paper over it
with unfiltered content.

### Sanity check
- Track the UNTAGGED rate over time as regex/heading rules are extended.
  A falling rate with a stable or shrinking review queue means the added
  rules are generalizing, not just fitting one spec's resolved items —
  the thing k-NN against a single-domain gold set failed to do.
- Confirm no code path still references `ROLE_THRESHOLD`,
  `role_embedding_fallback.py`, or `repair_untagged` — all three are
  gone in this revision, not just disabled.

---

## Conflicts With Good Practice — correction to item 1

Original: *"an in-process dict is the right first move... don't add
SQLite/Redis for this."* Correct given a durable store was never actually
new infrastructure to add — Node + Mongo was already the intended
architecture from the start of this project, just not yet wired up in
this consolidated plan. The review queue is what makes deferring it no
longer viable: a pending review has to survive a restart and an
unbounded wait, which an in-process dict cannot do. This isn't scope
creep — it's finishing a decision already made, prompted by the first
feature that actually depends on it.

---

## Verification Plan — addition

### End-to-end (add to the existing Phase 6 end-to-end sequence)
5. Upload a spec, confirm `pending_review_count > 0` if any item is
   genuinely ambiguous. Resolve every pending item via
   `POST /review-queue/{spec_hash}/{item_id}`. Regenerate the plan and
   test cases; confirm `pending_review_count == 0` and previously-excluded
   item text now appears where it's role-relevant. Restart the server
   between resolving and regenerating, to confirm the resolution survived
   — this is the one check that actually proves the durable-storage
   prerequisite is real, not assumed.
