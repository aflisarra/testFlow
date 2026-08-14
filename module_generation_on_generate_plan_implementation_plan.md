# Module generation on `POST /generate-plan` — implementation plan

## Target flow

```text
POST /upload-spec
  → extract, chunk, itemize, role-tag
  → persist items with module_status=pending
  → no OpenRouter and no embedding model

POST /generate-plan
  → load durable items
  → ensure module list exists and is current
  → generate and validate module cards
  → confidently tag test-relevant items
  → atomically persist modules + assignments
  → validate coverage
  → assemble deterministic plans
```

## Goal

Make `POST /generate-plan` the single owner of module generation and module
assignment. Upload remains a fast, deterministic ingestion operation. Plan
generation creates or reuses a versioned module snapshot, validates assignment
quality, and then creates plans from all testable evidence—not only formal
`REQUIREMENT` items.

The implementation is complete when:

- `/upload-spec` never calls OpenRouter or loads the sentence-transformer;
- the first `/generate-plan` for an ingestion snapshot makes at most one module
  LLM call and one tagging pass;
- later `/generate-plan` calls reuse the same current module snapshot unless
  regeneration is explicitly requested or its evidence fingerprint is stale;
- a module with `REQUIREMENT`, `ACCEPTANCE`, or module-specific
  `NON_FUNCTIONAL` evidence can produce a plan;
- low-confidence evidence is visible as unassigned instead of being forced into
  an arbitrary module;
- module generation and item assignments are committed atomically without
  replacing role-review decisions;
- the response reports module and coverage diagnostics instead of silently
  omitting modules or evidence.

## Scope and non-goals

### In scope

- FastAPI ingestion, module orchestration, tagging, validation, plan assembly,
  schemas, test-case filtering, cancellation, and observability.
- Node/Mongo module lifecycle fields, atomic module persistence, generation
  bridge changes, and test-plan traceability fields.
- Backward-compatible rollout for existing ingestion snapshots and plans.
- Tests at Python unit/route, Node unit/service, and end-to-end contract levels.

### Not in scope for this change

- Replacing the deterministic plan builder with an LLM plan writer.
- Automatically resolving `UNTAGGED` role-review items.
- Rebuilding the whole role classifier. The current role distribution must be
  measured and may require a separate correction, but this change must not
  make module assignments conceal role-classification errors.
- A full Angular module-review editor. The API will expose enough diagnostics
  for a later UI; a minimal warning display can be added during rollout.

## Current behavior and gaps

1. `routers/test_plans.py::upload_spec()` calls `ingest_spec()`.
2. `services/ingestion/ingest.py::ingest_spec()` itemizes, tags roles, calls
   `generate_module_list()`, calls `tag_module()`, and persists the complete
   snapshot.
3. Node calls FastAPI `/upload-spec` before FastAPI `/generate-plan` when a new
   suite/file is submitted.
4. `services/plan_service.py::generate_test_plans()` calls
   `get_or_generate_module_list()`, so `/generate-plan` can also generate on a
   cache miss. Module generation therefore has two owners.
5. `tag_module()` uses an unconditional best-score assignment with no score or
   winner-margin threshold. Every item is assigned when module cards exist,
   including `GLOSSARY`, `OUT_OF_SCOPE`, and unresolved `UNTAGGED` items.
6. Plan assembly accepts only items whose role is `REQUIREMENT` and that have a
   `requirement_id`. Modules supported only by `ACCEPTANCE` or
   `NON_FUNCTIONAL` evidence are skipped.
7. Test-case filtering includes `FEATURE`, `REQUIREMENT`, and `ACCEPTANCE`, but
   excludes `NON_FUNCTIONAL`, so NFR evidence would still be lost downstream
   even if a plan were created.
8. Module state is represented only by `SpecIngestion.modules`; an empty list
   cannot distinguish pending, failed, stale, or genuinely empty generation.
9. FastAPI updates modules by replacing the complete item/module snapshot.
   Node preserves reviewed roles defensively, but module-only updates should not
   need to rewrite immutable source fields or role-review state.
10. `services/ai_service.py` writes `openrouter_response.txt` into the watched
    source tree. Under `uvicorn --reload`, that can cause a reload during a live
    generation request and also persists potentially sensitive spec output.

## Agreed behavioral decisions

### 1. Module generation ownership

- `/upload-spec` owns document extraction, chunking, itemization, deterministic
  role tagging, review-queue state, and initial persistence.
- `/generate-plan` owns ensuring the module snapshot, module assignment,
  coverage validation, and deterministic plan assembly.
- `generate_module_list()` remains a focused LLM adapter. A new orchestration
  function owns cache validation, locking, tagging, persistence, and failure
  state.

### 2. Ensure versus regenerate

`POST /generate-plan` accepts a module policy:

- `ensure` (default): reuse a ready snapshot when its fingerprint and algorithm
  version match; otherwise generate it once.
- `regenerate`: intentionally create a new module snapshot and reassign items.

Node maps its existing `regenerate=true` plan action to `module_mode=regenerate`.
Ordinary retries and repeated reads use `module_mode=ensure`.

### 3. Which roles receive module assignments

| Role | Assignment policy | Can make a module plan-eligible? |
|---|---|---:|
| `REQUIREMENT` | Exactly one confident module or `UNASSIGNED` | Yes |
| `ACCEPTANCE` | Exactly one confident module or `UNASSIGNED` | Yes |
| `NON_FUNCTIONAL` | One/many explicit modules, or `CROSS_CUTTING` | Yes |
| `FEATURE` | Exactly one confident module or `UNASSIGNED` | No, supporting evidence only |
| `CONTEXT` | Optional supporting association | No |
| `ACTOR` | Optional supporting association | No |
| `GLOSSARY` | Do not classify into a functional module | No |
| `OUT_OF_SCOPE` | Do not classify into a functional module | No |
| `UNTAGGED` | Do not classify until its role is resolved | No |

“All tagged” means every plan-relevant item has a confident association or an
explicit disposition (`UNASSIGNED` or `CROSS_CUTTING`). It does not mean forcing
every document item into the highest-scoring module.

### 4. Plan eligibility

A functional module is plan-eligible when it has at least one confidently
linked item whose role is:

```python
PLAN_EVIDENCE_ROLES = frozenset({
    "REQUIREMENT",
    "ACCEPTANCE",
    "NON_FUNCTIONAL",
})
```

- `ACCEPTANCE` without a formal `REQUIREMENT` still produces a plan.
- A module-specific `NON_FUNCTIONAL` item still produces a plan.
- A `FEATURE` by itself does not produce a normal ready plan. It is reported as
  `insufficient_traceability` so the module is not silently lost.
- A cross-cutting NFR produces or contributes to a dedicated quality plan (for
  example security, performance, accessibility, or availability) rather than
  being forced into one functional module.

### 5. Traceability contract

Introduce typed plan evidence while retaining `requirements` during a
compatibility window:

```json
{
  "evidence": [
    {
      "item_id": "ITEM-00042",
      "external_id": "AC-00042",
      "role": "ACCEPTANCE",
      "title": "Payment confirmation",
      "description": "Then the receipt is displayed",
      "source": "CHUNK-009"
    }
  ],
  "requirements": []
}
```

- `evidence` is canonical for new code.
- `requirements` remains a backward-compatible projection containing formal
  requirement evidence only.
- Acceptance and NFR records receive stable external IDs derived from their
  immutable item IDs (`AC-xxxxx`, `NFR-xxxxx`), or consumers use `item_id`
  directly.

### 6. Assignment quality

Module assignment uses more than the generated description:

- module name and description;
- the full item heading path and item text;
- embeddings of the module's cited source items;
- a deterministic heading/name match signal;
- the best score and the margin between the best and second-best module.

An assignment is accepted only when both a calibrated minimum score and a
minimum winner margin pass. Thresholds must come from labelled fixtures; they
must not be guessed from one production document.

Generated `source_item_ids` are strong evidence, but not blindly exclusive:

- a requirement or acceptance item cited by multiple functional modules is
  ambiguous and must be validated or left unassigned;
- context and cross-cutting NFR evidence may legitimately support multiple
  modules;
- every retained module card must still cite at least one valid item.

### 7. Module identity

Add a stable `module_id` to module cards and use it for item, plan, and
test-case filtering. Keep the current module name fields temporarily for API
compatibility and display.

On regeneration, align new cards to prior cards using source overlap plus
name/description similarity. Preserve IDs for confident matches and issue new
IDs only for genuinely new modules. Never use a mutable display name as the
sole join key.

## Target data model

### Node `SpecIngestion`

Extend `backend-2026/src/models/spec-ingestion.model.js` with:

```text
moduleStatus: pending | generating | ready | needs_review | failed | stale
moduleVersion: integer
moduleAlgorithmVersion: string
moduleEvidenceFingerprint: string | null
moduleGenerationStartedAt: Date | null
moduleGenerationCompletedAt: Date | null
moduleGenerationError: string | null
moduleGenerationLease: string | null
moduleCoverageSummary: object
modules[].id: stable module ID
modules[].kind: functional | quality
modules[].source_item_ids: evidence citations
```

Keep the existing ingestion `status` independent. A snapshot can be ready for
role review while `moduleStatus` is still `pending`.

### Node `SpecIngestionItem` and Python `Item`

Add canonical assignment metadata:

```text
moduleIds / module_ids: string[]
primaryModuleId / primary_module_id: string | null
moduleMethod / module_method: source | heading | hybrid | human | none
moduleScore / module_score: number | null
moduleMargin / module_margin: number | null
moduleDisposition / module_disposition: assigned | unassigned | cross_cutting | excluded
moduleAlgorithmVersion / module_algorithm_version: string | null
```

Keep `module` as a temporary display-name projection. New filtering and joins
must use IDs.

### Node `TestPlan` and FastAPI plan schema

Add:

```text
moduleId / module_id: string | null
planKind / plan_kind: functional | quality
evidence: typed evidence[]
coverageStatus / coverage_status: ready | needs_review
```

Retain `module` and `requirements` for compatibility.

## API contracts

### `POST /upload-spec`

Behavior after the change:

- returns after deterministic item/role persistence;
- persists `modules=[]` and `moduleStatus=pending` for a new snapshot;
- does not import/load the embedding model and does not call OpenRouter;
- returns `module_status: "pending"` with existing hash/count fields.

### `POST /generate-plan`

New request field:

```text
module_mode: ensure | regenerate   # default ensure
```

Recommended response:

```json
{
  "test_plans": [],
  "modules": [],
  "module_status": "ready",
  "module_version": 1,
  "module_coverage": {
    "eligible_item_count": 12,
    "assigned_item_count": 11,
    "unassigned_item_ids": ["ITEM-00027"],
    "cross_cutting_item_ids": ["ITEM-00031"],
    "excluded_item_count": 83,
    "low_confidence_count": 1
  },
  "skipped_modules": [
    {"module_id": "MOD-003", "reason": "insufficient_traceability"}
  ],
  "pending_review_count": 6
}
```

Failure semantics:

- `404`: ingestion snapshot does not exist;
- `409`: generation cancelled or another valid module-generation lease owns
  the snapshot;
- `422`: module output is invalid or there is no usable module evidence;
- `503`: OpenRouter, embedding model, or persistence dependency unavailable;
- `200` with `module_status=needs_review`: useful plans exist, but some
  plan-relevant items remain unassigned. Never hide this condition.

### Internal Node persistence API

Add module-specific operations rather than using full snapshot replacement:

1. Claim generation for `(specHash, evidenceFingerprint,
   algorithmVersion)`. This is an atomic compare-and-set and returns a lease.
2. Commit module cards, assignment patches, version, and coverage summary using
   the lease. The commit is atomic from the caller's perspective.
3. Mark the lease failed with a bounded error message.

The commit updates only module-owned fields. It must not overwrite item text,
role, human-review state, dismissal audit fields, or requirement IDs.

## Implementation phases

## Phase 1 — lock contracts and add regression tests

### Python

Add failing tests before moving behavior:

- `tests/test_ingestion_without_modules.py`
  - upload ingestion persists items with no modules;
  - injecting module generator/tagger functions that raise proves neither is
    called during ingestion.
- Extend `tests/test_deterministic_plans.py`:
  - acceptance-only module creates a plan;
  - module-specific NFR-only module creates a plan;
  - feature-only module is reported as `insufficient_traceability`;
  - cross-cutting NFR creates a quality plan;
  - mixed evidence remains in document order.
- Extend `tests/test_manifest.py` to prove `NON_FUNCTIONAL` evidence reaches
  module-scoped test-case generation.

### Node

- Extend `test/spec-ingestion-models.test.js` for module lifecycle fields,
  stable IDs, assignment metadata, and legacy defaults.
- Add service tests proving module-only commits preserve reviewed and dismissed
  item state.

### Exit criteria

- Tests describe the new behavior and fail for the expected current-code
  reasons, not because of fixtures or network dependencies.

## Phase 2 — add backward-compatible storage and API fields

### Node files

- Modify `src/models/spec-ingestion.model.js` with module lifecycle/version and
  module-card fields.
- Modify `src/models/spec-ingestion-item.model.js` with canonical assignment
  metadata.
- Modify `src/models/testplan.model.js` and the embedded TestSuite plan schema
  with `moduleId`, `planKind`, typed `evidence`, and `coverageStatus`.
- Update `src/utils/test-artifact-fields.js` so normalization preserves the new
  fields rather than silently dropping them.
- Add module-generation claim/commit/fail methods to
  `src/services/spec-ingestion.service.js`.
- Add protected routes/controllers under
  `/api/internal/spec-ingestions/:specHash/module-generation`.

### Python files

- Extend `services/ingestion/items.py::Item` with assignment metadata while
  continuing to deserialize legacy snapshots.
- Extend `services/ingestion/store_client.py` with claim, commit, and fail
  operations.
- Extend `schemas/test_plan_schema.py` with module lifecycle, diagnostics,
  typed evidence, and compatibility fields.

### Compatibility requirements

- A legacy item with only `module` and `module_score` still deserializes.
- Existing test plans still load and export.
- New fields are additive; old clients can ignore them.
- No data migration deletes or rewrites human decisions.

### Exit criteria

- Node and Python can round-trip both legacy and new snapshots.
- Atomic module commits cannot modify role-owned fields.

## Phase 3 — make upload deterministic and module-free

### Modify `python-2026/services/ingestion/ingest.py`

- Remove `select_module_evidence()`, `generate_module_list()`, `tag_module()`,
  tiny-module diagnostics, Gold module scoring, and their imports from the
  upload path.
- Retain chunking, itemization, role tagging, pending-review calculation, and
  role/method observability.
- Persist items with module disposition defaults and `moduleStatus=pending`.
- Refine idempotency: an existing role-ready snapshot is a hit even if modules
  are pending; module lifecycle must not cause re-itemization.

### Modify `python-2026/routers/test_plans.py`

- Keep `/upload-spec` responsible only for extraction and deterministic
  ingestion.
- Return `module_status` from the durable snapshot.
- If `/generate-plan` receives a file directly, run item-only ingestion first
  and then continue through the same module orchestration path. Do not keep a
  second eager path for file requests.
- Remove the ineffective `spec_text`-only branch or define a deliberate
  ingestion contract for it; current deterministic generation requires a
  durable `spec_hash`.

### Modify Node upload bridge

- Keep the existing `/upload-spec` call used to establish `specHash` and
  `specText`.
- Do not expect modules to be ready after upload.
- Reduce upload timeout after observing the deterministic ingestion latency;
  module-generation latency belongs to `/generate-plan`.

### Exit criteria

- OpenRouter request count is zero during upload.
- The embedding model is not loaded during upload.
- Review endpoints work while `moduleStatus=pending`.

## Phase 4 — create one module orchestration path

### Add `python-2026/services/ingestion/module_orchestration.py`

Create an `ensure_modules_for_plan()` operation that:

1. Loads items and current module metadata in one snapshot read.
2. Selects trusted module evidence.
3. Computes an evidence fingerprint from item ID, role, role method, text,
   heading path, review state, and the module algorithm version.
4. Reuses a ready matching snapshot for `module_mode=ensure`.
5. Claims a generation lease for missing, stale, failed-retry, or explicitly
   regenerated state.
6. Checks cancellation before the LLM call.
7. Calls `generate_module_list()` exactly once.
8. Validates module cards and assigns stable IDs.
9. Calls the confidence-aware module tagger exactly once.
10. Validates coverage and constructs a summary.
11. Checks cancellation again before persistence.
12. Atomically commits cards and assignment patches.
13. Marks generation failed on an exception without destroying the prior ready
    snapshot.

Return a typed result containing modules, tagged items, version, reuse status,
coverage, and skipped/ambiguous evidence.

### Modify `python-2026/services/plan_service.py`

- Replace direct use of `get_or_generate_module_list()` with
  `ensure_modules_for_plan()`.
- Pass cancellation scope/request ID into orchestration.
- Assemble plans only from the returned committed version.
- Remove or deprecate the old cache-miss generator after all callers migrate.

### Concurrency and idempotency

- Only one caller may generate a given fingerprint/version at a time.
- A second `ensure` request either reuses the completed version or receives a
  bounded retryable response; it must not make a duplicate LLM call.
- A stale lease expires safely.
- `regenerate` creates the next version; it does not mutate the last ready
  version until commit succeeds.

### Exit criteria

- First `ensure` generates once; second `ensure` reuses.
- Concurrent `ensure` calls result in one LLM call.
- Failed regeneration leaves the last ready version usable and exposes failure
  diagnostics.

## Phase 5 — implement confidence-aware and role-aware tagging

### Modify `python-2026/services/ingestion/module_tagger.py`

- Accept only roles allowed by the assignment-policy table.
- Represent excluded, unassigned, assigned, and cross-cutting outcomes
  explicitly.
- Encode item text plus full heading context.
- Encode module name, description, and an aggregate of cited evidence.
- Blend semantic, heading, and citation signals deterministically.
- Record best score, runner-up margin, method, and algorithm version.
- Apply configured thresholds calibrated by fixture tests.
- Support multi-module associations for explicit/cross-cutting NFR evidence.
- Never use `argmax` alone as proof of a valid assignment.

### Validation rules

- Every `REQUIREMENT`, `ACCEPTANCE`, and `NON_FUNCTIONAL` item is counted as
  assigned, unassigned, or cross-cutting.
- Every assignment references a module in the same committed module version.
- Every module cites valid evidence.
- Invalid duplicate citations for functional testable evidence are reported.
- `GLOSSARY`, `OUT_OF_SCOPE`, and unresolved `UNTAGGED` items remain excluded.

### Calibration

- Expand `services/ingestion/module_gold.py` beyond one module-list comparison
  to include item-to-module labels and cross-cutting NFR examples.
- Measure precision, recall, unassigned rate, and coverage by role.
- Select minimum score and margin from validation data, then version the values
  as part of `MODULE_ALGORITHM_VERSION`.

### Exit criteria

- Low-confidence testable items remain `UNASSIGNED`.
- Excluded roles do not inflate module distribution counts.
- Metrics are reported separately for requirements, acceptance criteria, and
  NFRs.

## Phase 6 — expand deterministic plan eligibility and traceability

### Modify `python-2026/services/plan_service.py`

- Replace `requirements_from_items()` as the eligibility gate with typed
  evidence extraction.
- Create a functional plan for each module containing at least one confidently
  linked `REQUIREMENT`, `ACCEPTANCE`, or module-specific `NON_FUNCTIONAL`
  item.
- Create deterministic quality plans for cross-cutting NFRs, grouped by an
  explicit quality category when available; otherwise use one bounded
  cross-cutting quality plan.
- Preserve formal requirements in the compatibility `requirements` field.
- Put all plan-relevant items into the new typed `evidence` field.
- Report modules skipped for `insufficient_traceability` or
  `assignment_needs_review`; never silently discard them.
- Base tiny/empty-module validation on plan-relevant evidence, not on the count
  of glossary/context items forcibly assigned to a module.

### Stable plan identity

- Derive plan IDs from `module_id`/plan kind or preserve an existing mapping;
  do not renumber unrelated plans merely because one module was added.
- Keep human-authored plan content/status when a regenerated module retains its
  stable ID. Treat merges/splits as explicit changes requiring reconciliation.

### Exit criteria

- Acceptance-only and module-specific-NFR-only tests pass.
- The number of plans can be explained from module evidence and
  `skipped_modules` diagnostics.
- Repeated generation against the same module version returns stable plan IDs.

## Phase 7 — propagate NFR and typed evidence into test cases

### Modify `python-2026/services/ingestion/manifest.py`

Change the test-case role contract to include `NON_FUNCTIONAL`:

```python
"generate-test-cases": {
    "FEATURE",
    "REQUIREMENT",
    "ACCEPTANCE",
    "NON_FUNCTIONAL",
}
```

### Modify `python-2026/services/case_service.py`

- Filter with `module_id`/`module_ids`, not module display-name equality.
- Include the selected plan's typed evidence in the prompt.
- Require generated cases to link only to evidence IDs supplied to the prompt.
- For quality plans, make the prompt request measurable NFR checks rather than
  generic functional steps.

### Modify Node bridge and models

- Pass `module_mode` to FastAPI `/generate-plan`.
- Preserve `modules`, `moduleCoverage`, `skippedModules`, `moduleId`,
  `planKind`, and typed `evidence` through normalization and persistence.
- Pass `plan_module_id` and plan evidence into `/generate-test-cases`.
- Continue returning legacy `module` and `requirements` fields to existing
  clients.

### Exit criteria

- A test case generated for an NFR-backed plan receives its NFR evidence.
- A functional plan cannot receive evidence belonging only to another module.
- Node round-trips all new response fields without dropping them.

## Phase 8 — observability, performance, and security cleanup

### Structured events

Add or update events for:

- `spec_ingestion_role_ready`;
- `module_generation_claimed`;
- `module_generation_reused`;
- `module_generation_started`;
- `module_tagging_completed`;
- `module_generation_committed`;
- `module_generation_failed`;
- `plan_assembly_completed`.

Include spec hash prefix, generation version, algorithm version, evidence count,
eligible/assigned/unassigned/cross-cutting counts by role, module count, plan
count, reuse flag, and stage latencies. Do not log full specification text or
complete LLM responses.

### Remove watched-tree response files

- Remove unconditional writes to `openrouter_response.txt` and
  `openrouter_repaired_response.txt` from `services/ai_service.py`.
- If raw-response debugging is temporarily required, gate it behind an
  explicit development-only setting, redact it, and write outside watched and
  version-controlled directories.

### Embedding model readiness

- Download/cache the configured sentence-transformer as a deployment build
  step or container layer.
- Optionally warm it during application startup/readiness so the first plan
  request does not download model files.
- Production must not depend on unauthenticated Hugging Face downloads during
  a user request.

### Exit criteria

- A generation request does not trigger `watchfiles` reload.
- Logs make module-generation and tagging latency individually visible.
- No raw spec/LLM payload is written to the repository.

## Phase 9 — migration and rollout

### Data migration

For existing `SpecIngestion` records:

- modules empty → `moduleStatus=pending`;
- modules present but no algorithm version → `moduleStatus=stale`;
- preserve existing module names/scores for audit until a new version commits;
- initialize assignment disposition conservatively from legacy data but do not
  treat legacy forced assignments as confidence-approved;
- do not modify role-review or dismissal fields.

For existing plans:

- retain `module` display name and `requirements`;
- leave `moduleId` null until a safe module-name-to-ID match is found;
- never fuzzy-link a legacy plan automatically when the match is ambiguous.

### Deployment order

1. Deploy additive Node schemas and internal module endpoints.
2. Deploy readers that accept both legacy and new fields.
3. Deploy FastAPI behind `MODULE_GENERATION_STAGE=generate_plan`.
4. Enable the new path in a non-production environment and run labelled specs.
5. Mark legacy module snapshots stale in controlled batches.
6. Enable the new path for production generation while keeping a rollback flag.
7. Remove the old eager generation and full-snapshot module update path after
   metrics and rollback windows are satisfactory.

### Rollback

- Disabling the feature flag restores reading the last ready module snapshot;
  it must not require undoing a data migration.
- A failed new module version never overwrites the prior ready version.
- New additive fields are ignored safely by older readers during the rollout
  window.

## Verification matrix

| Scenario | Expected result |
|---|---|
| New upload | Items and roles persisted; module pending; zero LLM calls |
| First plan generation | One module LLM call, one tagging pass, atomic commit |
| Repeated `ensure` | Modules reused; zero module LLM calls |
| Explicit regenerate | New version generated; stable IDs preserved where matched |
| Concurrent first generation | One owner/LLM call; no duplicate committed versions |
| OpenRouter failure | Module failed/retryable; ingestion and reviews remain usable |
| Embedding failure | No partial assignment commit; explicit dependency error |
| Cancellation | Lease released/expired; no partial module snapshot |
| Acceptance-only module | Functional plan created with typed acceptance evidence |
| Module-specific NFR-only module | Plan created with typed NFR evidence |
| Cross-cutting NFR | Quality plan or explicit cross-cutting association |
| Feature-only module | Reported as insufficient traceability, not silently lost |
| Low-confidence requirement | `UNASSIGNED`, visible in coverage diagnostics |
| Glossary-heavy document | Glossary excluded from functional module coverage |
| Human review before plan | Reviewed role participates in evidence fingerprint/generation |
| Human review after plan | Snapshot becomes stale only when evidence changes materially |
| Existing legacy snapshot | Readable; safe pending/stale transition; no lost review data |

## End-to-end acceptance test

Using the same specification represented by the attached log:

1. Upload it and assert 39 chunks/118 items are persisted without any
   OpenRouter, Hugging Face, or embedding-stage log during `/upload-spec`.
2. Assert the ingestion is role-ready and module-pending.
3. Call `/generate-plan` with `module_mode=ensure`.
4. Assert exactly one module-generation LLM call and one model-tagging pass.
5. Assert `GLOSSARY`, `OUT_OF_SCOPE`, and unresolved `UNTAGGED` items are not
   counted as functional module assignments.
6. Assert every `REQUIREMENT`, `ACCEPTANCE`, and `NON_FUNCTIONAL` item appears
   in assigned, unassigned, or cross-cutting coverage.
7. Assert every module with acceptance or module-specific NFR evidence has a
   plan, even if it has no formal requirement.
8. Assert all omissions appear in `skipped_modules` or unassigned diagnostics.
9. Call `/generate-plan` again with `module_mode=ensure` and assert zero new
   module LLM calls.
10. Call with `module_mode=regenerate` and assert one new version is committed
    without erasing role-review history.
11. Assert no source-tree response file is written and no reload occurs.

## Documentation updates

After implementation, update:

- `python-2026/context.md` to place module generation/tagging under
  `/generate-plan`, not `/upload-spec`;
- `backend-2026/context.md` with module lifecycle and internal persistence
  contracts;
- `python-2026/README.md` with `module_mode`, response diagnostics, and model
  readiness requirements;


## Recommended delivery slices

1. **Slice A — behavior boundary:** tests, additive schemas, item-only upload,
   and generation owned by `/generate-plan` while temporarily retaining the
   existing tagger.
2. **Slice B — trustworthy assignment:** role-aware tagging, thresholds,
   dispositions, coverage diagnostics, and stable module IDs.
3. **Slice C — complete plan evidence:** acceptance/NFR plan eligibility,
   quality plans, typed traceability, and NFR test-case propagation.
4. **Slice D — production hardening:** atomic leases/versioning, migration,
   model warmup, observability, security cleanup, and documentation.

Do not declare Slice A production-complete by itself: it fixes ownership and
timing, but Slice B is what makes module tags safe to use for filtering and
Slice C prevents acceptance/NFR-backed modules from disappearing.
