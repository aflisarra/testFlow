# Reback-Angular v1.0 — Global Architecture Analysis

## Overview

**Reback-Angular** is an Angular admin dashboard application dedicated to **test management and execution** (think a TestLab / QA Management platform). It follows a clean, feature-layered architecture using NgRx for state management, HTTP interceptors for auth, and lazy-loaded feature routes.

---

## Project Structure

```
Reback-Angular_v1.0/
├── Documentation/           # Static HTML docs (installation, changelog, customization)
└── Admin/                   # Main Angular application
    └── src/
        ├── main.ts          # Bootstrap entry point
        ├── styles.scss      # Global styles
        ├── environments/    # env configs (dev/prod)
        └── app/
            ├── app.component.ts     # Root component (<router-outlet>)
            ├── app.config.ts        # App-level providers (DI config)
            ├── app.routes.ts        # Top-level route table
            │
            ├── core/               # Singleton, app-wide infrastructure
            │   ├── guards/         # Route guards
            │   ├── interceptors/   # HTTP interceptors
            │   ├── services/       # Core business services
            │   └── utils/          # Core utilities
            │
            ├── store/              # NgRx state management
            │   ├── authentication/ # Auth slice (actions/effects/reducer/selector)
            │   └── layout/         # Layout slice (sidebar, theme)
            │
            ├── layouts/            # UI shell components
            │   ├── vertical/       # Main vertical layout wrapper
            │   ├── sidebar/        # Left navigation sidebar
            │   ├── topbar/         # Top navigation bar
            │   ├── right-sidebar/  # Settings/right panel
            │   ├── auth-layout/    # Layout for unauthenticated pages
            │   └── private-layout/ # Layout for authenticated pages
            │
            ├── views/              # Feature pages (lazy-loaded)
            │   ├── views.route.ts  # Feature route aggregator
            │   ├── auth/           # Login, Reset Password
            │   ├── dashboards/     # Analytics dashboard
            │   ├── project/        # Project Management
            │   ├── test/           # Test Cases & Test Plans
            │   ├── execution/      # Execution Management, History, Details
            │   ├── admin/          # Users, Roles, Shared admin views
            │   └── pages/          # Utility pages (Unauthorized, etc.)
            │
            ├── components/         # Reusable standalone UI components
            │   ├── auth/           # Auth-related widgets
            │   ├── logo-box.component.ts
            │   └── page-title.component.ts
            │
            ├── shared/             # Shared directives
            ├── interfaces/         # All TypeScript interfaces/models
            ├── helpers/            # Pure utility functions (utils.ts)
            └── common/             # App-wide constants, menu metadata, chart models
```

---

## Architectural Layers

```
┌─────────────────────────────────────────────────────────────┐
│                        BROWSER                              │
│                   (index.html / main.ts)                    │
└──────────────────────────┬──────────────────────────────────┘
                           │ Bootstrap
┌──────────────────────────▼──────────────────────────────────┐
│                    AppComponent                             │
│              (app.routes.ts  →  router-outlet)              │
└──────┬───────────────────┬──────────────────────────────────┘
       │                   │
  [public]           [authenticated]
       │                   │
  auth-layout        private-layout (vertical shell)
       │               ├── Topbar
  ┌────▼────┐          ├── Sidebar  (menu-meta.ts drives links)
  │  Login  │          ├── Right Sidebar
  │  Reset  │          └── <router-outlet> → Feature Views
  └─────────┘
```

### Core Layer
| File | Role |
|---|---|
| `auth.interceptor.ts` | Attaches JWT Bearer token to every HTTP request, handles token refresh |
| `forbidden.interceptor.ts` | Catches 403 responses, redirects to `/unauthorized` |
| `require-action.guard.ts` | Route guard — checks roles/permissions before activating a route |
| `unsaved-changes.guard.ts` | Warns user on navigation away from dirty forms |
| `auth.service.ts` | Login, logout, token storage, session validation |
| `api.service.ts` | Base HTTP wrapper (GET/POST/PUT/DELETE) used by all other services |
| `testlab.service.ts` | Test case, test plan CRUD operations |
| `selenium-runner.service.ts` | Triggers and monitors automated test executions |
| `admin-management.service.ts` | User & role administration |
| `project-invitations.service.ts` | Project invite flow |
| `auth-session-monitor.service.ts` | Polls/detects session expiry |
| `ui-notification.service.ts` | Toast / snackbar notifications |
| `title.service.ts` | Updates browser tab title per route |

### NgRx Store
| Slice | Managed State |
|---|---|
| `authentication` | `currentUser`, `isLoggedIn`, `token`, `error` |
| `layout` | Sidebar mode, theme (light/dark), layout type |

---

## Example Flows

### 🔐 Flow 1 — User Login

```
User submits login form (signin view)
    │
    ▼
AuthService.login(credentials)
    │── POST /api/auth/login  (via ApiService)
    │       └── auth.interceptor.ts attaches headers
    │
    ▼
On success:
    ├── Store JWT in localStorage/sessionStorage
    ├── Dispatch AuthActions.loginSuccess({ user, token })
    │       └── authentication.reducer.ts → updates store
    ├── authentication.effects.ts → navigates to /dashboards
    └── auth-session-monitor.service.ts starts polling
```

---

### 🛡️ Flow 2 — Protected Route Access

```
User navigates to /project or /test/cases
    │
    ▼
Angular Router
    │
    ▼
require-action.guard.ts
    ├── Reads token from store (authentication.selector.ts)
    ├── Checks user role/permission against route data
    │
    ├── [AUTHORIZED] → Activate route → Load Feature Component
    └── [FORBIDDEN]  → forbidden.interceptor.ts → redirect /pages/unauthorized
```

---

### 📋 Flow 3 — Test Plan Creation

```
User opens Test Plan page (views/test/test-plan.component.ts)
    │
    ▼
Component calls TestlabService.createTestPlan(payload)
    │
    ▼
ApiService.post('/api/testplans', payload)
    │── auth.interceptor.ts injects Bearer token
    │
    ▼
Backend responds
    │
    ├── Success → ui-notification.service (toast "Plan created!")
    │             → Component refreshes list
    └── Error   → ui-notification.service (error toast)
                  → Optional: unsaved-changes.guard activated on nav away
```

---

### 🚀 Flow 4 — Test Execution Launch

```
User selects test cases → clicks "Run" (execution/Execution-Management)
    │
    ▼
ExecutionComponent calls SeleniumRunnerService.startExecution(config)
    │
    ▼
ApiService.post('/api/executions', config)
    │
    ▼
Backend starts Selenium job → returns executionId
    │
    ▼
Component navigates to /execution/details/:executionId
    └── Execution-Details component polls status via SeleniumRunnerService
        └── On completion → Execution-History view records result
```

---

### 👤 Flow 5 — Admin User Management

```
Admin navigates to /admin/users
    │
    ▼
require-action.guard.ts → verifies ADMIN role
    │
    ▼
AdminManagementService.getUsers()
    │── GET /api/admin/users
    │
    ▼
Users list rendered (admin/users view)
    │
    ├── Invite user → project-invitations.service.ts.invite()
    └── Assign role → AdminManagementService.updateUserRole()
                      └── roles view (admin/roles)
```

---

## Key Design Decisions

| Pattern | Implementation |
|---|---|
| **State management** | NgRx (actions → effects → reducer → selector) — only for Auth & Layout |
| **HTTP layer** | Centralized `ApiService` + interceptors (no per-component HTTP calls) |
| **Routing** | Lazy-loaded feature modules via `views.route.ts` aggregator |
| **Layouts** | Two shells: `auth-layout` (public) and `private-layout` (authenticated) |
| **Permissions** | Guard-based (`require-action.guard`) driven by route `data` metadata |
| **Notifications** | Centralized `ui-notification.service` — no inline toasts in components |
| **Menu** | Driven by `common/menu-meta.ts` — single source of truth for navigation |

