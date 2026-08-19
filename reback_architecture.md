# Reback Angular v1.0 - Frontend Architecture

> Current-state snapshot verified against the code on 2026-08-19. This
> document focuses on the Angular frontend and describes the other services
> only where they affect frontend design or data flow.

For service internals, use the dedicated references:

- [Express backend context](./backend-2026/context.md)
- [FastAPI worker context](./python-2026/context.md)
- [Full-system diagram](./architecture-testflow.svg)

## 1. Overview and system boundary

Reback Angular is an Angular 19 single-page application for test management
and execution. It provides the user interface for:

- authentication and password recovery;
- user, role, project, and invitation management;
- specification upload and human review;
- test-suite, test-plan, and test-case workflows;
- Selenium execution, history, dashboards, and reports; and
- application layout and navigation preferences.

The frontend does not connect to MongoDB, FastAPI, OpenRouter, or Selenium
directly. Its application boundary is the Express API.

```text
Browser
  |
  v
Angular SPA (:4200 in development)
  |
  | HTTP/JSON or multipart form data
  | Authorization: Bearer <access token>
  v
Express API (:3000)
  |-- MongoDB persistence
  |-- FastAPI AI/ingestion worker (:8000)
  `-- Selenium/Chrome execution
```

Express is the browser-facing facade. It authorizes the request, loads or
persists product data, and calls FastAPI when ingestion or AI work is needed.
This boundary keeps internal tokens, model configuration, and worker URLs out
of the Angular build.

## 2. Frontend project structure

The runnable application is under `Reback-Angular_v1.0/Admin`.

```text
Admin/src/
+-- main.ts                         # Standalone bootstrap
+-- styles.scss                     # Global style entry point
+-- environments/                   # Development and production API URLs
`-- app/
    +-- app.component.*             # Root outlet, title, route progress
    +-- app.config.ts               # Application-wide providers
    +-- app.routes.ts               # Public/private route shells
    +-- core/
    |   +-- guards/                  # Action and unsaved-change guards
    |   +-- interceptors/            # Auth and HTTP error interception
    |   +-- services/                # API-facing and shared services
    |   `-- utils/                   # JWT decoding
    +-- store/
    |   +-- authentication/          # Login user/error state and effects
    |   `-- layout/                  # Theme, menu, and topbar state
    +-- layouts/
    |   +-- auth-layout/             # Public authentication shell
    |   +-- private-layout/          # Authenticated shell entry
    |   +-- vertical/                # Topbar + sidebar + nested outlet
    |   +-- topbar/
    |   +-- sidebar/
    |   `-- right-sidebar/           # Available settings panel component
    +-- views/
    |   +-- auth/                    # Sign-in and reset password
    |   +-- dashboards/              # Analytics
    |   +-- admin/                   # Users and roles
    |   +-- project/                 # Project management
    |   +-- test/                    # Suites, plans, cases, spec review
    |   +-- execution/               # Run, history, and detail pages
    |   +-- change-password/
    |   `-- pages/unauthorized/
    +-- components/                  # Shared standalone UI components
    +-- interfaces/                  # Typed API and domain contracts
    +-- common/                      # Menu metadata and shared constants
    +-- shared/                      # Shared directives
    `-- helpers/                     # Pure frontend helpers
```

The application uses standalone components rather than Angular NgModules.
Feature folders organize the code, but they are not separate feature modules.

## 3. Bootstrap and application providers

`main.ts` calls `bootstrapApplication(AppComponent, appConfig)` and registers
the Iconamoon icon collection.

`app.config.ts` is the composition root for frontend infrastructure:

| Provider | Purpose |
| --- | --- |
| `provideRouter` | Application routing, anchor scrolling, and top-position restoration |
| `provideStore` | NgRx authentication and layout slices |
| `localStorageSyncReducer` | Rehydrates the authentication and layout slices |
| `provideEffects` | Authentication login/logout effects |
| `provideHttpClient` | Fetch-backed Angular HTTP client with DI interceptors |
| `AuthInterceptor` | Bearer token attachment and refresh-on-401 behavior |
| `ForbiddenInterceptor` | Currently passes errors through unchanged |
| `provideAppInitializer` | Starts `AuthSessionMonitorService` at application startup |
| `provideToastr` | Bottom-center toast notifications |
| `provideStoreDevtools` | NgRx inspection, restricted in production mode |

`AppComponent` stays thin. It owns the root `router-outlet`, initializes the
browser-title service, and starts/completes the route progress bar around
navigation events.

## 4. Routing and layout composition

### Shell hierarchy

```text
AppComponent
`-- router-outlet
    |-- /auth/* -> AuthLayoutComponent
    |   `-- authentication route content
    |
    `-- authenticated routes -> PrivateLayoutComponent
        `-- VerticalComponent
            |-- TopbarComponent
            |-- SidebarComponent
            `-- router-outlet -> feature view
```

The empty path redirects to `/dashboard/analytics`. The authenticated shell
uses a functional `canActivate` guard that checks whether
`AuthenticationService.session` contains a token. If not, it returns a
`RedirectCommand` to `/auth/sign-in`.

This top-level check establishes UI session state only. It does not validate
the token with the server; Express remains responsible for authentication.

### Route map

| Area | Route | Component/loading model |
| --- | --- | --- |
| Sign-in | `/auth/sign-in` | `SigninComponent` through lazy-loaded auth routes |
| Password reset | `/auth/reset-pass` | `ResetPassComponent` through lazy-loaded auth routes |
| Dashboard | `/dashboard/analytics` | `AnalyticsComponent` through lazy-loaded dashboard routes |
| Users | `/admin/users` | Eager route component, action guard |
| Invite user | `/admin/users/invite` | Eager route component, action guard |
| Roles | `/admin/roles` | Eager route component, action guard |
| Projects | `/project` | Eager route component, action guard |
| Test plans | `/test` | Eager route component, unsaved-change guard |
| Test cases | `/test-cases` | Eager route component, unsaved-change guard |
| Test validation | `/test-cases/:id` | Eager route component |
| Test-suite list | `/test-suites` | Lazy component import |
| Execution | `/execution/Execution-Management` | Eager route component |
| Execution history | `/execution/Execution-History` | Eager route component |
| Execution by ID | `/execution/:id` | Dynamic route placed after fixed execution routes |
| Change password | `/change-password` | Lazy component import |
| Access denied | `/unauthorized` | `UnauthorizedComponent` |

`/testcases` and `/testcases/:id` are compatibility aliases for the hyphenated
test-case routes.

### Permission-aware navigation

`common/menu-meta.ts` defines the navigation tree. `SidebarComponent` clones
that metadata and filters users, roles, projects, tests, and execution links
according to the current user's numeric action IDs.

The corresponding route guards use `requireAnyAction(...)`:

| Feature | Accepted action IDs |
| --- | --- |
| Users | `2, 3, 4, 5, 10` |
| Invite user | `2` |
| Roles | `6, 7, 8, 9, 17` |
| Projects | `11, 12, 13, 14, 15` |

Menu filtering and route guards improve the user experience, but they are not
security controls. The Express `requireAction` and resource-access middleware
must make the final authorization decision.

## 5. State ownership

The frontend does not put all application data in NgRx. State is divided by
lifetime and scope.

### NgRx global state

| Slice | Fields | Persistence |
| --- | --- | --- |
| `authentication` | `isLoggedIn`, current `user`, last `error` | Rehydrated from local storage |
| `layout` | theme, topbar color, menu color, menu size | Rehydrated from local storage |

`AuthenticationEffects` handles the login request, dispatches success or
failure, navigates after success, shows the login-error toast, and performs
client logout navigation.

`PrivateLayoutComponent` subscribes to layout state and projects it onto HTML
data attributes consumed by the theme styles. `VerticalComponent` updates the
menu state for desktop/mobile breakpoints.

### Service-level shared state

Projects use two small RxJS services instead of an NgRx feature slice:

- `ProjectsStateService` owns a `BehaviorSubject` containing the latest
  project list and refreshes it through `AdminManagementService`;
- `ProjectsRefreshService` publishes mutation notifications so the topbar and
  test/project views can reload related data.

### Feature-local state

Test suites, plans, cases, review items, execution filters, modal state, and
form-dirty state live in their view components and are persisted through
services when necessary. There are no NgRx domain slices for these entities.

This makes the effective pattern:

```text
Global session/layout       -> NgRx
Cross-view project refresh  -> RxJS singleton services
Feature workflow state      -> component state + backend persistence
```

## 6. HTTP and service layer

### Base API wrapper

`ApiService` is the common HTTP wrapper. It:

- prepends `environment.apiUrl` to relative paths;
- accepts already absolute HTTP(S) URLs when required;
- exposes typed `get`, `post`, `put`, `patch`, `delete`, and blob-download
  helpers; and
- is used by the domain services instead of repeating URL construction.

Development points at `http://localhost:3000`. Production sets `apiUrl` to an
empty string, so a production build expects the API under the same origin or
behind a reverse proxy.

### Domain services

| Service | Frontend responsibility |
| --- | --- |
| `AuthenticationService` | Sign-in, registration, token storage, decoded identity, password operations |
| `AuthSessionMonitorService` | Schedules token renewal around JWT expiry |
| `AdminManagementService` | Users, roles, actions, and projects |
| `ProjectInvitationsService` | List, accept, and ignore invitations |
| `ProjectsStateService` | Shared cached project list |
| `ProjectsRefreshService` | Cross-view project-change notifications |
| `TestLabService` | Suites, spec ingestion, reviews, plans, cases, workflow state, Word export |
| `SeleniumRunnerService` | Execution launch, filters, history, detail, abort, trend, report download |
| `ProjectService` | Project/plan/case lookups used by the test list view |
| `TitleService` | Derives browser titles from route `data.title` |
| `UiNotificationService` | Notification abstraction available to features |

`interfaces/` is the contract boundary for these services. API payload types
should be added there rather than recreated in several components.

### Canonical and compatibility API paths

`TestLabService` currently contains both the suite-scoped product API and
older compatibility calls:

- suite-scoped flows use `/api/testsuites/:id/...` for plans, ingestion,
  review, sessions, executions, and exports;
- generation of new plans/cases still has calls through the historically
  named `/api/ollama/...` Express facade;
- `/api/ollama` is only a Node route name. Angular does not talk to a local
  Ollama process, and the Node service currently delegates to FastAPI and
  OpenRouter;
- `/testcases` remains a frontend route alias, while normalized test artifacts
  are accessed through the test-suite API.

New frontend integrations should prefer a suite-scoped Express route when one
exists. No component should embed a FastAPI URL or an internal service token.

## 7. Authentication and authorization flow

### Sign-in

```text
SigninComponent
  -> dispatch login({ email, password })
  -> AuthenticationEffects
  -> AuthenticationService.login()
  -> ApiService POST /api/auth/signin
  -> Express response: user + access token + refresh token
  -> tokens saved in localStorage
  -> loginSuccess(user) updates NgRx
  -> navigate to returnUrl or dashboard
```

The access token is stored under `token`; the refresh token is stored under
`refreshToken`. The authentication slice is also local-storage synchronized,
so the user/actions needed by the sidebar and guards survive reloads.

### Authenticated requests and refresh

`AuthInterceptor` reads the current access token and attaches the Bearer
header. On a `401`, it:

1. bypasses normal interceptors for the refresh request;
2. posts the refresh token to `/api/auth/refresh-token`;
3. falls back to `/refresh-token` only if the primary path returns `404`;
4. serializes concurrent refresh attempts through a `BehaviorSubject`;
5. stores rotated tokens; and
6. retries the original request once.

If refresh fails, it clears local tokens and navigates to sign-in.
`AuthSessionMonitorService`, started by the app initializer, also refreshes
proactively based on the JWT expiry.

### Forbidden responses

The current `ForbiddenInterceptor` does not redirect on `403`; it simply
rethrows the error. Route-level permission failures redirect to
`/unauthorized`, while API-level `403` responses must be handled by the
calling component/service until a global policy is implemented.

## 8. Feature architecture

### Administration and projects

The admin views call `AdminManagementService` for users, roles, actions, and
projects. Modal components own create/edit confirmation state. Project
mutations publish through `ProjectsRefreshService`, allowing test views and
the shell to refresh their project-dependent selections.

### Test design

The `views/test` area is the largest frontend feature and coordinates:

- project and suite selection;
- DOCX upload and stored specification editing;
- pending role-review items and human resolution/dismissal;
- plan generation/regeneration and plan editing;
- test-case generation/regeneration and validation;
- unsaved-change checks and session status persistence;
- Word export; and
- navigation into execution.

`TestLabService` is the shared facade for this workflow. Components should not
call `HttpClient` directly or call FastAPI endpoints.

### Execution

`SeleniumRunnerService` separates execution DTO normalization from the UI. It
supports:

- starting one test case;
- filtering execution history by project, suite, plan, status, and date;
- reading a detailed execution model;
- aborting a running execution;
- loading pass/fail trends and test-type breakdowns; and
- downloading a suite execution report as a blob.

Execution pages render backend state; Selenium and browser-driver lifecycle
remain outside Angular.

### Dashboard

The analytics view composes project, suite, plan, execution, trend, and type
breakdown data from the product services. It is a read model in the component,
not a dedicated dashboard store.

## 9. Principal frontend flows

### Specification ingestion and review

```text
Test-plan view
  -> TestLabService.ingestSpecification(FormData, optional suiteId)
  -> Express /api/testsuites/ingest-spec
     or /api/testsuites/:id/ingest-spec for an existing suite
  -> Express calls FastAPI /upload-spec and persists its result
  <- testSuiteId + pendingReviewCount

Review panel
  -> GET /api/testsuites/:id/role-reviews
  -> PATCH role or DELETE dismissal
  -> Express updates MongoDB directly
  <- refreshed pending count/item state
```

The browser works with a test-suite ID. Express translates that to the
specification hash used by the ingestion worker/store. The frontend never
needs to understand the internal claim/lease/module protocol.

### Test-plan generation

```text
Test-plan view
  -> POST /api/testsuites/:id/generate-plan
     or compatibility POST /api/ollama/generate-plan
  -> Express calls FastAPI, persists normalized TestPlan records
  <- testPlans, pendingReviewCount, module status/coverage metadata
  -> component updates editable plan state
  -> save session / export / generate cases
```

The response may report `MODULE_GENERATION_IN_PROGRESS`, a generation
cancellation, or an upstream timeout. Those are backend/worker states surfaced
through Express; Angular should display them without bypassing the facade.

### Test-case generation

```text
Selected test plan
  -> TestLabService.generateTestCases({ testSuiteId, planId, ... })
  -> POST /api/ollama/generate-test-cases
  -> Express loads the suite/plan and calls FastAPI with its module scope
  -> Express persists normalized TestCase records
  <- generated or reused cases
```

### Test execution

```text
Execution view
  -> SeleniumRunnerService.runSingleTestCase(...)
  -> POST /api/selenium/run-test-case
  -> Express/Selenium executes and stores evidence
  <- executionId and status
  -> history/detail endpoints provide subsequent state
```

## 10. Frontend design rules

When extending the Angular application:

1. Keep the browser-to-system boundary at Express. Do not add FastAPI URLs,
   OpenRouter keys, MongoDB access, or `X-Internal-Token` values to Angular.
2. Put reusable request logic in a core/domain service and reuse `ApiService`;
   avoid direct `HttpClient` calls in view components.
3. Add request/response contracts to `interfaces/` and normalize backend shape
   differences in the service layer.
4. Use NgRx for truly application-wide state. Keep short-lived form, modal,
   filter, and workflow state local to the owning feature.
5. Treat menu filtering and route guards as presentation logic. Every
   sensitive action still requires backend authorization.
6. Add fixed routes before parameterized routes, as the execution route table
   already does.
7. Add `canDeactivate` protection to any new route that owns a dirty editable
   workflow.
8. Preserve the production same-origin assumption unless deployment also
   updates `environment.prod.ts` and CORS/reverse-proxy configuration.

## 11. Current frontend constraints

- Access and refresh tokens are stored in `localStorage`, so frontend XSS
  prevention is part of session security.
- `ForbiddenInterceptor` has no behavior beyond rethrowing errors.
- The app mixes current suite-scoped endpoints with legacy `/api/ollama`
  compatibility paths; consolidation should happen in the service layer, not
  in components.
- Only auth and dashboard route tables are lazy-loaded as groups. Most product
  views are imported by `views.route.ts` and enter the main bundle.
- Projects use RxJS singleton state while other product data is component
  local. This is intentional today but should remain explicit as features
  grow.
- The menu uses numeric action IDs in code. Any permission-ID change must stay
  synchronized with route guards and the Express action catalog.

## 12. Development entry points

| Concern | File |
| --- | --- |
| Bootstrap/providers | `Admin/src/main.ts`, `Admin/src/app/app.config.ts` |
| Route shells | `Admin/src/app/app.routes.ts` |
| Product routes | `Admin/src/app/views/views.route.ts` |
| Navigation | `Admin/src/app/common/menu-meta.ts`, `Admin/src/app/layouts/sidebar/sidebar.component.ts` |
| Root state | `Admin/src/app/store/index.ts` |
| Authentication | `Admin/src/app/core/services/auth.service.ts`, `Admin/src/app/core/interceptors/auth.interceptor.ts` |
| Product API facade | `Admin/src/app/core/services/testlab.service.ts` |
| Execution API facade | `Admin/src/app/core/services/selenium-runner.service.ts` |
| API base URL | `Admin/src/environments/environment*.ts` |

Run Angular commands from `Reback-Angular_v1.0/Admin`. See the
[frontend README](./Reback-Angular_v1.0/README.md) for setup, tests, linting,
and build commands.
