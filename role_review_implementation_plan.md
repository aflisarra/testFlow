# Role-tag review UI and Node API implementation plan

## Scope

Build a user-facing review queue for items left `UNTAGGED` after deterministic
role tagging. A reviewer can assign a final role or remove an item from the
pending queue. Regex and heading-coverage tuning are explicitly out of scope.

The Node backend is the browser-facing API. FastAPI remains the ingestion and
classification worker; its internal endpoints must never be called by Angular.

---

## Current readiness audit

The persistence foundation exists, but the endpoints are **not yet ready for
the Node/Angular product flow**.

Existing endpoints:

- FastAPI exposes `GET /review-queue/{spec_hash}` and
  `POST /review-queue/{spec_hash}/{item_id}`.
- Node exposes internal ingestion persistence under
  `/api/internal/spec-ingestions/...`, protected by `X-Internal-Token`.

Those are worker-to-worker endpoints. Angular cannot safely use the Node
internal routes, and it should not call FastAPI directly because that bypasses
the Node JWT/test-suite authorization boundary.

There are also two integration gaps that must be fixed before the queue can be
used in the normal Node generation flow:

1. `TestSuite` does not persist the `specHash` used to identify the ingestion
   snapshot, so a browser request addressed by test-suite id cannot locate its
   review queue.
2. The Node-to-FastAPI generation calls do not consistently pass `spec_hash`
   (or `plan_module` for test-case generation). Deterministic generation and
   the review queue need this linkage.

---

## Product behaviour

### Review an item

For each pending item, show:

- item text;
- heading path as breadcrumbs;
- nearest heading;
- the role selector; and
- a suggested role field — rendered only if non-null. Today this is always
  `null` and the field must be hidden from the reviewer when absent; it is
  kept in the response schema for forward compatibility only.

The reviewer selects a role from the supported role labels (not `UNTAGGED`) and
applies it. This is a durable human decision made entirely in Node/MongoDB:

- `role` becomes the selected role;
- `role_method` becomes `human`;
- the item is marked reviewed, with reviewer and timestamp when available.

**No FastAPI call is made when resolving a role.** The update is a direct
MongoDB write on `SpecIngestionItem`. Module assignment is **not**
recalculated at this point — module re-tagging only occurs when a test plan's
module is explicitly edited (see Module re-tagging section below).

### Module re-tagging (test plan changes only)

A FastAPI re-tag pass is required in the following cases, and only these:

1. The description of an existing module card is changed.
2. A module card is deleted.

In both cases Node calls a protected FastAPI internal endpoint that re-runs
`tag_module()` against the stored module cards for that `specHash`. The
operation uses only the existing stored items and module cards — it must not
regenerate the module list or call the module generator LLM.

Role resolution never triggers this path.

### Delete an item

"Delete" means **dismiss from the pending review queue**, not hard-delete the
source item. Hard deletion would lose provenance and make later generation
results impossible to audit.

Add an explicit review state:

```text
review_state: pending | resolved | dismissed
dismissed_at: Date | null
dismissed_by: String | null
dismissal_reason: String | null
```

A dismiss action retains the original item and its role (`UNTAGGED`) in the
ingestion snapshot, but pending-queue queries exclude it. Restoring dismissed
items is not required for the first release, but the state supports adding it
later.

---

## Phase R1 — establish the test-suite to ingestion link

### specHash propagation

FastAPI's existing `/upload-spec` endpoint already performs ingestion and
returns `spec_hash` in its response. Node must:

1. Forward the uploaded DOCX bytes directly to FastAPI `/upload-spec` (not
   extract text locally before calling FastAPI).
2. Read `spec_hash` from the FastAPI response.
3. Persist `spec_hash` on the corresponding `TestSuite` document in MongoDB.

Do not derive a substitute hash from truncated `specText`. The hash must
identify the exact byte sequence used to create the stored items and modules.
FastAPI is the single source of truth for this value.

### Node data changes

1. Add `specHash` (String, indexed) to the `TestSuite` Mongoose model.
2. Add an optional `module` field (String, nullable) to the Node `TestPlan`
   model. Preserve it in plan normalization, dual writes, reads, and
   serialization.
3. Extend `SpecIngestionItem` with the explicit review-state and audit fields
   above. Migrate existing records: `role == "UNTAGGED" && reviewed == false`
   → `pending`; reviewed items → `resolved`.

### Generation bridge changes

1. Pass the stored `spec_hash` from `TestSuite` to FastAPI `/generate-plan`.
2. Preserve every returned plan's `module` field, and pass both `spec_hash`
   and `plan_module` when Node requests `/generate-test-cases`.
3. For legacy test suites with no `specHash`, return a clear `409 Conflict`
   from review and generation paths. The response body must include a
   machine-readable `code: "SPEC_NOT_INGESTED"` so the Angular client can
   render the appropriate recovery message (see Phase R3).

---

## Phase R2 — Node-owned review API

Place browser-facing routes inside the existing test-suite route tree, guarded
by the same JWT authentication and `requireTestSuiteAccess` middleware used by
other test-suite data.

```text
GET    /api/testsuites/:testSuiteId/role-reviews
PATCH  /api/testsuites/:testSuiteId/role-reviews/:itemId
DELETE /api/testsuites/:testSuiteId/role-reviews/:itemId
```

### Contracts

`GET` returns:

```json
{
  "specHash": "...",
  "pendingCount": 2,
  "items": [
    {
      "itemId": "ITEM-00042",
      "text": "...",
      "headingPath": ["Requirements", "Search"],
      "nearestHeading": "Search",
      "suggestedRole": null
    }
  ]
}
```

`PATCH` body:

```json
{ "role": "ACTOR" }
```

It validates the role (must be in `ROLE_LABELS`, not `UNTAGGED`), writes the
resolution directly to `SpecIngestionItem` in MongoDB (no FastAPI call), and
returns the updated item plus the remaining `pendingCount`.

`DELETE` optionally accepts:

```json
{ "reason": "Not relevant to testing" }
```

It changes `review_state` to `dismissed` in MongoDB; the stored item is
retained. Return `204 No Content` (or a small JSON confirmation if that
matches current API conventions) and the refreshed `pendingCount`.

### Service boundaries

The Node controller loads the test suite, confirms access, obtains `specHash`,
and calls the local Node `spec-ingestion.service` for all Mongo reads/writes.
Do not expose `/api/internal/...` to the browser.

The public FastAPI `/review-queue/...` routes should be retired or locked
behind `X-Internal-Token` once this Node facade is in place, so Node is the
only browser-facing review facade.

---

## Phase R3 — Angular review panel

Add review methods to `TestlabService`; do not make direct `HttpClient` calls
from the component:

```ts
getRoleReviews(testSuiteId)
resolveRoleReview(testSuiteId, itemId, role)
dismissRoleReview(testSuiteId, itemId, reason?)
```

Add a `RoleReviewItem` interface matching the Node response. Integrate a
collapsible **Specification review** panel in the existing test-plan flow,
before plan generation.

### Legacy suite recovery (409 / `SPEC_NOT_INGESTED`)

When the Node API returns `409` with `code: "SPEC_NOT_INGESTED"`, the panel
must render an inline, non-blocking banner:

> **"This test suite was generated before role tagging was introduced.
> Re-upload the original specification to enable review."**

The banner includes a direct link or button to the test-suite's spec upload
section. Generation is not blocked — the banner is informational only.
No modal, no hard gate.

### Normal state (items present)

- show a badge: `N items need review` (hidden when `pendingCount == 0`);
- fetch on panel open and refresh after every mutation;
- render text, heading breadcrumbs, nearest heading, and a role selector;
- the `suggestedRole` field is displayed only when non-null; hide it when null;
- provide **Apply role** and **Dismiss** actions, with dismissal confirmation;
- use the application's existing notification/error-handling pattern; and
- show a non-blocking generation warning when pending items remain. Generation
  may continue; items are never auto-assigned or silently excluded.

Do not put internal tokens or FastAPI base URLs in Angular configuration.

---

## Phase R4 — migration and compatibility

1. Backfill `review_state` lazily on read or through a one-off Mongo migration.
2. Existing test plans without `module` remain legacy records; do not infer a
   module by fuzzy matching their titles.
3. Existing test suites without `specHash` must be re-ingested from their
   original uploaded document before review is available.
4. Ensure a new or re-ingested specification replaces only its own linked
   snapshot/hash; do not make review records cross test suites merely because
   their text happens to match.

---

## Phase R5 — verification

### Node tests

- authorized user can list pending items for their suite;
- unauthorized user cannot access another suite's queue;
- missing `specHash` returns `409` with `code: "SPEC_NOT_INGESTED"`;
- resolving a role writes directly to MongoDB with no FastAPI call;
- dismissing hides an item from GET while its Mongo record remains retained;
- restart/read-back proves both actions are durable.

### Angular tests

- service uses the three Node routes;
- panel renders heading context;
- `suggestedRole` field is hidden when null;
- legacy-suite 409 renders the recovery banner, not an error screen;
- applying a role refreshes the list and badge;
- dismiss confirmation removes the item after success;
- API errors leave the item visible and show an error notification.

### End-to-end check

Upload a DOCX, confirm the returned `spec_hash` is saved on its `TestSuite`,
open the review panel, resolve one ambiguous item and dismiss another, restart
both services, then reload. The resolved item must retain its human role;
the dismissed item must remain absent from the pending list but present in the
ingestion snapshot for audit.

---

## Delivery order

1. Implement R1 first: hash propagation via the FastAPI `/upload-spec` response
   is required by every later step.
2. Add R2 Node API (direct Mongo writes for role resolution, no FastAPI bridge
   for role changes).
3. Add R3 Angular panel, including the legacy 409 recovery banner.
4. Run R4 migration/backfill strategy and R5 verification before exposing the
   UI to users.
