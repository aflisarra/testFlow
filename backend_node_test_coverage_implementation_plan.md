# Backend Node test coverage — implementation plan

## Goal

Reach and enforce at least 80% test coverage for the Node code introduced or
materially changed by:

- `implementation_plan.md` (durable spec-ingestion persistence);
- `role_review_implementation_plan.md` (suite-owned role review API);
- `module_generation_on_generate_plan_implementation_plan.md` (module lifecycle,
  typed evidence, and the FastAPI generation bridge).

Python, Angular, Selenium execution, authentication, and unrelated legacy CRUD
code are outside this coverage initiative. Their transitive imports must not be
allowed to inflate the result.

The final gate is 80% for lines, branches, and functions across the owned Node
scope. A green global percentage alone is not sufficient: every critical service
and controller listed below must be exercised, and plan-owned code must not be
excluded merely to make the number pass.

## Implementation status (2026-08-24)

The first implementation pass is complete for the deterministic Node test
scope:

- coverage harness and explicit owned-file manifest: complete;
- snapshot, review, module lifecycle, controllers, token middleware, and route
  wiring: complete;
- FastAPI upload/plan/case bridge contract tests: complete;
- final 80% unit/contract coverage gate: enabled and passing;
- disposable-Mongo reconnect/concurrency integration profile: pending;
- CI workflow integration: pending until the repository's target CI provider is
  selected or an existing workflow is added.

Current enforced result: 90 tests passing, 93.48% statements/lines, 81.64%
branches, and 89.90% functions for the owned Node scope.

## Current baseline (2026-08-24)

Command used:

```powershell
cd D:\stage\testFlow\backend-2026
npm.cmd run test:coverage
```

Current result:

| Metric | Current |
|---|---:|
| Lines | 34.83% |
| Branches | 48.21% |
| Functions | 15.58% |
| Test cases | 19 actual assertions/tests, all passing |

Relevant file results reported by the current runner:

| File | Lines | Branches | Functions |
|---|---:|---:|---:|
| `src/models/spec-ingestion.model.js` | 100% | 100% | 100% |
| `src/models/spec-ingestion-item.model.js` | 100% | 100% | 100% |
| `src/models/testplan.model.js` | 98.88% | 50% | 100% |
| `src/models/testsuite.js` | 94.16% | 100% | 0% |
| `src/controllers/role-review.controller.js` | 36.57% | 20% | 27.27% |
| `src/services/spec-ingestion.service.js` | 8.88% | 100%* | 0% |
| `src/services/ollama.service.js` | 9.81% | 25% | 6.06% |

`*` The service functions are not called, so the displayed branch percentage is
not meaningful; only top-level module initialization is being counted.

The present report is incomplete in two ways:

1. files that are never imported, including the internal controller, route, and
   token middleware, do not appear as 0%; they simply disappear from the report;
2. `src/utils/test-artifact-fields.js` matches Node's test-file naming pattern,
   is discovered as an extra zero-test file, and is omitted from useful source
   coverage.

The first deliverable must therefore make the measurement trustworthy before
using it as a gate.

## Owned coverage scope

### Persistence and module lifecycle

- `src/models/spec-ingestion.model.js`
- `src/models/spec-ingestion-item.model.js`
- `src/services/spec-ingestion.service.js`
- `src/controllers/spec-ingestion-internal.controller.js`
- `src/routes/spec-ingestion-internal.routes.js`
- `src/middleware/requireInternalToken.js`

### Role review facade

- `src/controllers/role-review.controller.js`
- the role-review route registrations in `src/routes/testsuite.routes.js`
- the `specHash`/`ingestionScope` fields in `src/models/testsuite.js`

### Plan and case generation bridge

- plan-owned behavior currently in `src/services/ollama.service.js`;
- `src/controllers/ollama.controller.js` error/status mapping for plan and case
  generation;
- `src/models/testplan.model.js` and the embedded TestSuite plan schema;
- `src/utils/test-artifact-fields.js`;
- any focused generation-contract module extracted during Phase 5.

The coverage report may include supporting imports, but only the files above and
new modules extracted from them count toward the plan-specific gate.

## Test rules

- Use `node:test`, `node:assert/strict`, and `mock.method()` for unit tests.
- Unit tests must not connect to MongoDB, FastAPI, OpenRouter, or the network.
- Restore every method, environment variable, fake timer, and UUID stub after
  each test. Tests that patch shared CommonJS modules must not run concurrently.
- Use fixed SHA-256 hashes and small fixtures. Never write uploaded documents,
  screenshots, or AI responses into the source tree.
- Assert returned values and important side effects: Mongo filters/updates,
  FastAPI payloads/headers, state transitions, and HTTP status bodies.
- Do not test private implementation details when the same invariant can be
  proven through an exported service or controller operation.
- Keep a separate Mongo integration profile for unique-index and durability
  checks. Unit coverage must remain deterministic without that profile.

## Phase 0 — make coverage accurate and enforceable

### Coverage tooling

Add `c8` as a development dependency and configure a plan-specific coverage
profile with:

- `all: true`, so an unimported owned file is reported as 0%;
- explicit `include` entries for the owned scope;
- explicit exclusions only for `test/**`, migrations, generated output, and
  unrelated application code;
- text and LCOV reporters;
- no default exclusion that accidentally removes
  `src/utils/test-artifact-fields.js`;
- source maps disabled unless a later transpilation step requires them.

Add scripts similar to:

```json
{
  "test:unit": "node --test test/*.test.js",
  "test:coverage:plans": "c8 --all --reporter=text --reporter=lcov node --test test/*.test.js",
  "test:integration": "node --test test/integration/*.test.js"
}
```

Keep the include list in a committed `.c8rc.json` so the scope is reviewable.
The explicit `test/*.test.js` glob prevents Node from discovering source files
whose names begin with `test-`.

### Initial thresholds

Do not set a fake 80% gate while most critical services remain untested. Use
ratcheting thresholds that never move backward:

| Milestone | Lines | Branches | Functions |
|---|---:|---:|---:|
| Harness installed | record baseline | record baseline | record baseline |
| Persistence/review complete | 55% | 50% | 50% |
| Module lifecycle complete | 70% | 65% | 65% |
| Generation bridge complete | 80% | 80% | 80% |

Each milestone updates the configured minimums in the same commit as the tests.
The final phase enables `check-coverage` in CI.

### Exit criteria

- Exactly the intended `test/**/*.test.js` files run.
- Every owned source file appears in the report, including untouched/untested
  files at 0%.
- `test-artifact-fields.js` appears as source code in the report.
- A deliberately unimported fixture proves that `all: true` is effective.

## Phase 1 — fixtures and test harnesses

Create small reusable helpers under `test/helpers/`:

- `http-response.js`: an Express-like response spy supporting `status`, `json`,
  `end`, and `download`;
- `mongoose-query.js`: controlled fluent-query stubs for `select`, `sort`,
  `lean`, and resolved query values;
- `spec-fixtures.js`: valid hash, items, modules, assignments, ready snapshot,
  reviewed item, and dismissed item;
- `environment.js`: set/restore selected environment variables safely.

Fixtures should expose builder functions so each test states only the fields
that matter. Avoid one oversized shared fixture whose irrelevant defaults hide
invalid inputs.

### Exit criteria

- Helpers have their own focused tests where behavior is not trivial.
- No production module is edited only to accommodate a brittle mock.
- A service test can mock Mongoose's fluent APIs without a database connection.

## Phase 2 — durable ingestion and human review service tests

Add `test/spec-ingestion-service.test.js` and cover the public service contract.

### Snapshot replacement

- rejects an invalid hash, non-array inputs, more than 12 modules, duplicate
  item IDs, invalid roles/methods, invalid module kinds, and modules without
  valid source items;
- marks the ingestion `writing`, upserts every item, removes stale items, then
  marks the snapshot `ready`;
- persists an item-only upload with `modules=[]` and `moduleStatus=pending`;
- preserves a prior human role, reviewer, review state, and requirement ID on
  identical re-ingestion;
- preserves dismissal audit fields on identical re-ingestion;
- marks the snapshot `failed` and rethrows if item persistence fails;
- handles an empty item list without calling `bulkWrite`.

### Snapshot reads

- returns `null` unless the ingestion status is `ready`;
- sorts items by stable item ID;
- serializes every camelCase field to the documented snake_case contract;
- returns legacy-safe defaults for module status/version/coverage.

### Review queue

- the pending filter includes both explicit `pending` and legacy missing state;
- list/count return `null` for an unknown ingestion;
- resolution rejects `UNTAGGED` and unknown roles;
- resolution writes `roleMethod=human`, reviewer data, and a derived
  requirement ID only for `REQUIREMENT`;
- structural roles make `ready`, `needs_review`, or `failed` module snapshots
  `stale`;
- non-structural roles do not mark modules stale;
- dismissal retains the row and writes timestamp, reviewer, and bounded reason;
- already resolved/dismissed or unknown items return `null`.

### Exit criteria

- All exported review and snapshot functions execute success and failure paths.
- Re-ingestion tests prove role-owned fields cannot be overwritten.
- The plan-specific gate reaches at least the persistence/review milestone.

## Phase 3 — module claim/lease/commit/fail tests

Add `test/module-generation-lifecycle.test.js`. Treat the lifecycle as a state
machine and assert every transition.

### Claim

- missing snapshot returns `null`;
- matching fingerprint/algorithm in `ready` or `needs_review` reuses the current
  version without creating a lease;
- `force=true`, stale, failed, pending, or mismatched metadata requests a lease;
- an active non-expired lease returns `in_progress=true`;
- a stale lease can be reclaimed;
- returned metadata includes previous modules and the current version;
- UUID and time are deterministic in assertions.

### Commit

- rejects missing arrays, more than 12 modules, an invalid/stale lease, empty or
  duplicate modules, duplicate assignments, unknown item/module references, and
  incomplete assignment coverage;
- enforces exactly one primary module for `assigned`;
- enforces at least two modules for `cross_cutting`;
- accepts explicit `unassigned` and `excluded` outcomes;
- updates only module-owned fields on `SpecIngestionItem`; role, review, and
  dismissal fields must be absent from every assignment update;
- commits cards, fingerprint, algorithm version, coverage, completion time, and
  final `ready|needs_review` status;
- clears the lease and increments the version exactly once;
- returns `409` if the lease expires between validation and the final update.

### Failure

- valid lease changes the state to `failed`, stores an error capped at 1000
  characters, records completion, and clears the lease;
- stale/unknown lease returns `null`;
- the prior module cards/version are not overwritten.

### Exit criteria

- First claim, reuse, concurrent claim, forced claim, commit, stale commit, and
  failure are all represented.
- Tests explicitly prove module-only commits preserve human review and dismissal
  state.
- Line coverage reaches 70% and branch/function coverage reaches 65% for the
  owned scope.

## Phase 4 — internal API, security, and browser review facade

### Internal token middleware

Add `test/require-internal-token.test.js`:

- no configured secret returns 503;
- missing, wrong, and different-length tokens return 401 without throwing;
- `INTERNAL_API_TOKEN` takes precedence over `FASTAPI_SECRET`;
- matching token calls `next` exactly once and sends no response.

### Internal controller

Add `test/spec-ingestion-internal-controller.test.js` with mocked service
methods. Cover success, not-found, validation error, conflict, and unexpected
error behavior for replace/get/review/claim/commit/fail operations. Assert exact
HTTP status and response payload, including 204 for a successful replacement.

### Public role-review controller

Expand `test/role-review-controller.test.js` beyond mapping helpers:

- missing suite returns 404;
- missing `specHash` or `ingestionScope` returns 409 and
  `code=SPEC_NOT_INGESTED`;
- list returns the pending count and mapped heading context;
- list distinguishes an empty queue from a missing ingestion;
- resolve passes the authenticated user ID directly to the Node service and
  never calls FastAPI;
- resolve returns the updated item and refreshed count;
- dismiss returns 204, retains service-side audit data, and forwards the reason;
- list-all maps source chunk and classification metadata;
- service validation and unexpected errors keep their documented status/body.

### Route wiring and access

Add a small Express test app (using `supertest` or a built-in ephemeral HTTP
server) to prove:

- every `/api/internal/spec-ingestions/...` endpoint executes the internal-token
  middleware;
- the four suite review/spec-item routes use authentication and
  `requireTestSuiteAccess`;
- an unauthorized user cannot access another suite's review queue;
- route parameters and request bodies reach the intended controller.

Do not boot `src/index.js` or connect to MongoDB in these route tests.

### Exit criteria

- The internal controller, internal token middleware, and role-review controller
  each meet 80% for lines and branches.
- All Node verification scenarios from Phase R5 of the role-review plan have a
  unit/route test, except the restart check reserved for Phase 6.

## Phase 5 — FastAPI generation bridge and artifact propagation

`src/services/ollama.service.js` is over 1,100 lines and mixes document I/O,
authentication, persistence, and several unrelated operations. Testing the whole
file just to cover the plan-owned paths would produce slow and fragile tests.

Extract the plan/case request construction and response normalization into one
or more dependency-light modules, for example:

- `src/services/generation/generation-contract.js`;
- `src/services/generation/fastapi-generation.client.js`.

Extraction is allowed only when behavior is preserved. All plan-owned payload,
status, compatibility, and error logic must move with tests; code must not be
excluded merely because it is difficult to cover. Keep `ollama.service.js` as a
thin orchestration/delegation layer and test those delegates as well.

### Upload and suite linkage

- forwards the original DOCX bytes to `/upload-spec`;
- sends the configured internal token and timeout;
- persists FastAPI's exact `spec_hash`, the source hash, and ingestion scope on
  the selected TestSuite;
- never derives a hash from truncated specification text;
- missing file/suite/ingestion metadata produces the documented validation or
  `SPEC_NOT_INGESTED` error;
- FastAPI/network failure does not report successful ingestion.

### Plan generation

- normal generation sends `module_mode=ensure`;
- explicit regeneration sends `module_mode=regenerate`;
- an already ingested suite reuses its stored hash without uploading again;
- response normalization preserves `modules`, `moduleCoverage`,
  `skippedModules`, `pendingReviewCount`, `moduleStatus`, and `moduleVersion`;
- each plan preserves `moduleId`, `planKind`, `coverageStatus`, typed evidence,
  and legacy `module`/`requirements` fields through both persistence paths;
- `MODULE_GENERATION_IN_PROGRESS` remains a 409;
- a FastAPI timeout becomes 504;
- failure does not leave the suite marked as successfully generated.

### Test-case generation

- sends the stored `spec_hash`, stable `plan_module_id`, plan kind, and selected
  plan evidence;
- does not substitute module display-name equality for a stable ID;
- NFR evidence is preserved for quality plans;
- evidence belonging only to another module is never added;
- normalized cases preserve requirements and professional metadata;
- missing ingestion returns `SPEC_NOT_INGESTED` and makes no FastAPI call.

### Controller status mapping

Add focused tests for `ollama.controller.js` proving success, validation errors,
`SPEC_NOT_INGESTED`, module-generation conflict, timeout, generic FastAPI error,
and the intended suite failure-state update.

### Exit criteria

- Every Node bridge criterion in Phases 3 and 7 of the module-generation plan is
  represented by a test.
- No unit test makes a real HTTP, filesystem, MongoDB, or JWT-user lookup.
- The final owned scope reaches at least 80% lines, branches, and functions.

## Phase 6 — Mongo integration and durability checks

Add `test/integration/spec-ingestion-persistence.test.js`, guarded by an explicit
`MONGODB_TEST_URI`. CI should provide a disposable Mongo service/database; the
test must refuse a database name that does not clearly identify itself as a test
database.

Cover behavior that mocks cannot prove:

- unique `{specHash}` and `{specHash,itemId}` indexes;
- complete replacement removes stale rows without exposing a non-ready snapshot;
- identical re-ingestion is idempotent;
- resolved and dismissed decisions survive closing and reopening the Mongoose
  connection;
- claim and competing claim allow only one active lease;
- commit increments the version once and survives reconnect;
- a failed or stale commit does not expose a partial assignment snapshot.

Integration tests are required acceptance evidence but should not be mixed into
the fast unit coverage denominator. Their job is durability and atomicity, not
percentage inflation.

### Exit criteria

- The restart/read-back checks from both persistence and role-review plans pass.
- Tests clean only the explicitly validated disposable database.
- No developer or production database URI can be used accidentally.

## Phase 7 — enforce the 80% gate

Enable final `c8 --check-coverage` thresholds:

```text
lines:     80
branches:  80
functions: 80
```

Prefer per-file thresholds for focused service/controller modules. For large
legacy files that still contain unrelated behavior, require one of these before
excluding the file-level number:

1. move all plan-owned behavior into a focused covered module and test the thin
   delegate remaining in the legacy file; or
2. enforce changed-line coverage against the pre-plan baseline and document the
   exact baseline commit.

Aggregate coverage must never hide an untested critical state transition. Keep
the scenario matrix below as a second gate alongside the percentage.

Run on every backend change:

```powershell
cd D:\stage\testFlow\backend-2026
npm.cmd run lint
npm.cmd run test:unit
npm.cmd run test:coverage:plans
npm.cmd run test:integration  # in CI with MONGODB_TEST_URI
```

## Traceability matrix

| Plan requirement | Authoritative test evidence |
|---|---|
| Durable item-only snapshot | snapshot replacement service + Mongo integration |
| Only-ready reads | service test + replacement integration test |
| Human review survives re-ingestion | service preservation test + reconnect test |
| Dismissal retained but hidden from queue | service/controller test + reconnect test |
| Legacy suite returns `SPEC_NOT_INGESTED` | role-review and Ollama controller tests |
| Internal endpoints require shared token | middleware + route tests |
| First module generation claims once | lifecycle service test + competing claim integration |
| Matching ensure reuses existing modules | lifecycle claim test |
| Regenerate creates a new version | bridge payload test + lifecycle commit test |
| Invalid/stale lease returns 409 | service and internal-controller tests |
| Module commit cannot alter role/review data | assignment update assertion + Mongo integration |
| Failed generation preserves prior module cards | lifecycle failure test |
| Typed evidence and module diagnostics round-trip | normalization/model/bridge tests |
| Test cases receive `plan_module_id` and plan evidence | generation-client request test |
| Timeout maps to 504 | bridge/controller error tests |

## Recommended delivery order

1. Coverage harness and accurate baseline.
2. Snapshot/review service tests.
3. Module lifecycle state-machine tests.
4. Internal/public controller, security, and route tests.
5. Generation-contract extraction and bridge tests.
6. Mongo durability integration tests.
7. Final 80% gate and CI enforcement.

Each slice must leave all earlier tests green and raise or preserve the committed
threshold. Do not postpone failing edge cases until the final coverage pass.

## Definition of done

- All unit, route, lint, and Mongo integration commands pass.
- The committed report shows at least 80% lines, branches, and functions for the
  complete owned Node scope.
- No owned file is silently absent from the report.
- No plan-owned path is excluded to improve the percentage.
- Every row in the traceability matrix has a named passing test.
- Unit tests perform no external network or database access.
- Mongo integration tests prove persistence after reconnect and safe concurrent
  leasing.
- Existing backend tests remain green.
- The 80% threshold runs automatically in CI and fails the build on regression.
