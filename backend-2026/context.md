# `backend-2026` — contexte du projet

> Mis à jour le 2026-08-04. Ce document décrit l'état constaté du code, pas une cible d'architecture.

---

## Vue d'ensemble

`backend-2026` est l'API Node.js du produit de gestion et d'automatisation de tests. Elle fournit :

- l'authentification JWT, les rôles et les permissions par action ;
- les utilisateurs, projets et invitations d'équipe ;
- les suites, plans et cas de test stockés dans MongoDB ;
- la persistance résiliente de l'ingestion d'exigences (`SpecIngestion`, `SpecIngestionItem`) pour le service FastAPI (`python-2026`) via l'API interne (`/api/internal/spec-ingestions`) ;
- la génération de plans/cas par le backend FastAPI voisin (`python-2026`) ;
- l'exécution Selenium/Chrome de cas de test, l'annulation et l'historique d'exécution ;
- l'export Word des plans et un rapport PDF d'historique d'exécution ;
- les flux de réinitialisation de mot de passe par email/OTP.

La stack est Express 5 en CommonJS, Mongoose 7/MongoDB et Selenium WebDriver. Il n'y a pas d'étape de build : le serveur démarre directement avec `node src/index.js`.

---

## Structure du projet

```text
backend-2026/
├── src/index.js                         # Bootstrap Express, CORS, MongoDB et montage des routes
├── src/models/                          # Schémas MongoDB
│   ├── spec-ingestion.model.js          # Métadonnées d'ingestion (specHash, status, itemCount, modules) (Phase 4c)
│   ├── spec-ingestion-item.model.js     # Items atomiques extraits et taggués (specHash, itemId, text, role, module, etc.) (Phase 4c)
│   ├── testplan.model.js                # Plans de test normalisés TP-*
│   ├── testcase.model.js                # Cas de test normalisés TC-*
│   ├── testsuite.js                     # Suites de test
│   ├── TestExecution.model.js           # Historique d'exécutions Selenium
│   ├── user.model.js                    # Modèle utilisateur et refresh tokens
│   ├── role.model.js                    # Rôles RBAC
│   ├── action.model.js                  # Actions permissionnées
│   └── magictoken.model.js              # Jetons à usage unique / OTP
├── src/routes/                          # Déclaration des endpoints et middlewares
│   ├── spec-ingestion-internal.routes.js# API interne d'ingestion réservée à python-2026 (Phase 4c)
│   ├── testsuite.routes.js              # CRUD suites, plans, cas et exécution
│   ├── ollama.routes.js                 # Métier génération IA (proxy vers python-2026)
│   ├── selenium.routes.js               # Orchestration d'exécutions Selenium
│   ├── auth.routes.js / auth.magic.routes.js # Auth et réinitialisation mot de passe
│   ├── user.routes.js / project.routes.js    # Gestion utilisateurs et projets
│   └── ai-fix.routes.js                 # Détection d'erreurs et suggestions IA
├── src/controllers/                     # Adaptation HTTP et contrôleurs
│   ├── spec-ingestion-internal.controller.js # Contrôleur pour la persistance des ingestions
│   ├── testsuite.controller.js          # Contrôleur suites de test
│   ├── testplan.controller.js / testcase.controller.js # Contrôleurs plans/cas
│   ├── ollama.controller.js             # Contrôleur génération IA
│   └── selenium.controller.js           # Contrôleur Selenium
├── src/services/                        # Logique métier et intégrations externes
│   ├── ollama.service.js                # Communication avec python-2026 (upload-spec, generate-plan, generate-test-cases)
│   ├── selenium/                        # Chrome, décisions AI, actions UI/API, rapports PDF
│   └── export-word/                     # Génération DOCX
├── src/middleware/                      # Auth, permissions, accès projet/suite, upload
│   ├── authenticateUser.js              # Validation JWT Bearer
│   ├── requireInternalToken.js          # Validation X-Internal-Token pour routes internes (Phase 4c)
│   ├── requireAction.js                 # Vérification RBAC par action ID
│   ├── testsuite-access.middleware.js   # Validation d'accès aux suites
│   ├── project-access.middleware.js     # Validation d'accès aux projets
│   └── upload.js                        # Middleware Multer pour les fichiers
├── src/utils/                           # Normalisation des artefacts, JWT, upload de spécifications
├── src/migrations/                      # Migration de métadonnées plans/cas
├── src/database/                        # Seeders et migrations historiques
├── test/                                # Tests node:test (unitaires/modèles uniquement)
├── uploads/                             # Avatars, spécifications et captures à l'exécution
├── public/selenium-screenshots/         # Captures d'écran Selenium
├── .env.example
└── package.json
```

---

## Démarrage et dépendances

```powershell
cd D:\stage\testFlow\backend-2026
npm.cmd install
npm.cmd run dev       # nodemon, watch src/
# ou
npm.cmd start         # node src/index.js
```

Le serveur ne commence à écouter le port qu'après une connexion MongoDB réussie. Il écoute `PORT` (3000 par défaut). Sous cette machine, utiliser `npm.cmd`, car PowerShell bloque le shim `npm.ps1` via sa politique d'exécution.

Les dépendances principales sont `express`, `mongoose`, `jsonwebtoken`, `bcryptjs`, `multer`, `axios`, `selenium-webdriver`, `chromedriver`, `docx`, `pdfkit` et `nodemailer`.

Configuration effectivement lue par le code :

| Domaine | Variables |
|---|---|
| Serveur / données | `PORT`, `NODE_ENV`, `MONGODB_URI` (prioritaire) ou `MONGODB_URL`, `CORS_ORIGINS` |
| JWT | `JWT_SECRET`, `JWT_REFRESH_SECRET` |
| Service FastAPI / Interne | `FASTAPI_BASE_URL`, `FASTAPI_SECRET`, `INTERNAL_API_TOKEN`, `FASTAPI_TIMEOUT_MS`, `FASTAPI_GENERATION_TIMEOUT_MS`, `PYTHON_API_URL` |
| Email | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `FRONTEND_URL` |
| Exécution / traduction | `EXECUTION_MODEL_TIMEOUT_MS`, `FASTAPI_TRANSLATOR_TIMEOUT_MS` et variables d'authentification Selenium/Jira |

---

## Architecture HTTP et sécurité

`src/index.js` charge `.env`, configure CORS avec une liste blanche (`CORS_ORIGINS`, sinon `http://localhost:4200` et `http://localhost:3000`), sert `uploads/` sous `/api/uploads`, puis monte les routes public, authentifiées et internes.

1. **Jetons Utilisateur (JWT)** : Pour chaque requête portant un Bearer token valide, `authenticateUser` extrait le payload. Un middleware global réémet un nouvel access token dans `x-new-token`. Access tokens expirent après 1 h ; refresh tokens (stockés dans `User`) expirent après 7 jours.
2. **Permissions par Action (RBAC)** : `requireAction` recharge le rôle depuis MongoDB afin que les changements de permissions prennent effet immédiatement. Les actions ont des identifiants numériques stables (1 à 17).
3. **Sécurité Inter-Services (`requireInternalToken`)** : Les routes sous `/api/internal/spec-ingestions` sont protégées par `requireInternalToken`. Le middleware compare le header `X-Internal-Token` à la variable `INTERNAL_API_TOKEN` ou `FASTAPI_SECRET` via `crypto.timingSafeEqual` (protection contre les attaques de timing).

---

## Endpoints montés

Tous les chemins ci-dessous sont relatifs au serveur (préfixe `/api` sauf indication contraire).

| Domaine | Endpoints principaux | Protection constatée |
|---|---|---|
| Auth | `GET /auth/signup-roles`, `POST /auth/signup`, `/auth/signin`, `/auth/logout`, `/auth/refresh-token` | Publics. Le premier inscrit devient `admin`. |
| Réinitialisation | `POST /auth/forgot-password`, `/auth/verify-magic-token`, `/auth/verify-otp`, `/auth/reset-password` | Publics, hors préfixe `/api`; JWT à usage unique + OTP hashé en MongoDB. |
| Utilisateurs | `GET /users/profile`, CRUD `/users` | JWT ; la plupart des mutations/liste demandent des action IDs. |
| Rôles / actions | CRUD `/roles`, `POST /roles/reassign-delete`, `GET /actions` | Rôles : JWT ; Actions : public. |
| Projets | CRUD `/projects`, `PATCH /projects/:id/users`, `GET /projects/:id/usersProject` | JWT + actions. |
| Invitations | `GET /project-invitations`, `POST /:id/accept`, `POST /:id/ignore` | JWT. |
| Suites | CRUD `/testsuites`, plans/cas, session/statuts, projet, exécution et export Word | JWT sur le routeur ; garde d'accès `requireTestSuiteAccess`. |
| Génération AI | `GET /ollama/health`, `POST /ollama/chat`, `/ollama/generate-plan`, `/ollama/generate-test-cases`, `/ollama/cancel-generation` | Accessible via l'API client. |
| Ingestion Interne | `PUT /api/internal/spec-ingestions/:specHash`<br>`GET /api/internal/spec-ingestions/:specHash`<br>`GET /api/internal/spec-ingestions/:specHash/review-queue`<br>`PATCH /api/internal/spec-ingestions/:specHash/items/:itemId/review` | Protégé par `requireInternalToken` (`X-Internal-Token`) (Phase 4c). |
| Selenium | `POST /selenium/run-test-case`, liste/détail d'exécutions, annulation, rapport PDF | JWT au niveau routeur. |
| Analyse de panne AI | `POST /ai/detect-failure`, `/ai/get-fix-suggestion` | Accessible via l'API client. |
| Redirection de rôle | `GET /auth-redirect` | JWT. |

---

## Modèle de données

| Collection | Responsabilité / relations |
|---|---|
| `User` | `name`, `email`, mot de passe hashé, avatar, langue, rôle et refresh token. |
| `Role`, `Action`, `RoleAction` | Rôles et table d'actions permissionnées. Seeders créent `admin`, `user`, `management`. |
| `Project` | Propriétaire, membres assignés, dates et statut (`draft`, `active`, `paused`, `completed`). |
| `ProjectInvitation` | Invitation unique `(projectId, userId)` avec statut `pending`, `accepted`, `ignored`, `revoked`. |
| `TestSuite` | Métadonnées de suite, chemin/texte de spécification, URL cible, projet, statut de session/validation/exécution. |
| `TestPlan` | Collection normalisée liée à une suite. ID métier (`TP-*`), objectif, périmètre, priorité et exigences. Index unique `(testSuiteId, id)`. |
| `TestCase` | Lié à une suite et un plan. ID métier (`TC-*`), étapes, `stepDetails`, données de test, priorité/sévérité/type et auteur. Index unique `(testSuiteId, planId, id)`. |
| `TestExecution` | Identifiant d'exécution, statuts, logs, captures, résultats par étape, navigateur et durée. |
| `SpecIngestion` | Stockage persistant de l'ingestion (`specHash`, `status`, `itemCount`, `modules`). Index unique `{ specHash: 1 }`. (Phase 4c) |
| `SpecIngestionItem` | Items atomiques extraits et taggués (`specHash`, `itemId`, `headingPath`, `text`, `role`, `roleMethod`, `module`, `reviewed`, `reviewedBy`, `requirementId`). Index unique `{ specHash: 1, itemId: 1 }`. (Phase 4c) |
| `MagicToken` | Jeton/OTP de reset, à usage unique, avec TTL MongoDB. |

Les métadonnées QA sont normalisées dans `utils/test-artifact-fields.js` : priorités `low|medium|high|critical`, sévérités `trivial|minor|major|critical|blocker` et types de cas (functional, regression, e2e, api, ui, etc.).

---

## Flux métier principaux

### 1. Ingestion résiliente & Revue humaine (Phase 4c / 5a)
1. `python-2026` reçoit une spécification `.docx`, effectue l'itemisation, le taggajedes rôles et l'extraction des modules.
2. `python-2026` appelle `PUT /api/internal/spec-ingestions/:specHash` pour sauvegarder l'état de l'ingestion (`SpecIngestion`) et la liste complète des items (`SpecIngestionItem`).
3. Lorsque l'utilisateur consulte ou résout la file d'attente d'items `UNTAGGED`, `python-2026` délègue les requêtes à `GET /api/internal/spec-ingestions/:specHash/review-queue` et `PATCH /api/internal/spec-ingestions/:specHash/items/:itemId/review`.
4. La résolution met à jour de façon atomique `roleMethod: "human"`, `reviewed: true`, attribue le `requirementId` si nécessaire, et garantit la survie des données après redémarrage des services.

### 2. Génération des artefacts de test
1. Le frontend envoie une spécification à `/api/ollama/generate-plan`.
2. `ollama.service` transmet le fichier et le `spec_hash` à `python-2026` avec le header `X-Internal-Token`.
3. `python-2026` assemble les plans de manière déterministe depuis les items persistés dans MongoDB.
4. Les réponses sont enregistrées dans `TestPlan` / `TestCase` et liées à la `TestSuite`.

### 3. Exécution Selenium
1. `POST /api/selenium/run-test-case` lance Selenium WebDriver.
2. `ui.executor` déroule les étapes du test case, sollicite `python-2026` (`/ai/decide`) pour les étapes UI dynamiques et capture les résultats.
3. Les traces et captures d'écran sont enregistrées dans `TestExecution` et publiées sous `/api/uploads/screenshots/`.

---

## Seeders et migrations

```powershell
node src/database/seeders/seed.actions.js
node src/database/seeders/seed.roles.js
node src/database/seeders/seed.roleActions.js
node src/database/seeders/seed.user.js
```

La migration des artefacts QA s'exécute via :
```powershell
npm.cmd run migrate:test-artifacts
```

---

## Directives pour les modifications futures

- Préserver les IDs numériques des actions et les IDs métier `TP-*` / `TC-*`.
- Ne pas modifier la signature du middleware `requireInternalToken` sur les routes sous `/api/internal/`.
- Conserver les index uniques sur `SpecIngestion` et `SpecIngestionItem`.
