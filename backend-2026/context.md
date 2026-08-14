# `backend-2026` — contexte du projet

> Mis à jour le 2026-08-14. Ce document décrit l'état constaté du code, pas une cible d'architecture.

---

## Vue d'ensemble

`backend-2026` est l'API Node.js du produit de gestion et d'automatisation de tests. Elle fournit :

- l'authentification JWT, les rôles et les permissions par action ;
- les utilisateurs, projets et invitations d'équipe ;
- les suites, plans et cas de test stockés dans MongoDB ;
- la persistance résiliente de l'ingestion d'exigences (`SpecIngestion`, `SpecIngestionItem`) et du cycle versionné de génération des modules pour le service FastAPI (`python-2026`) via l'API interne (`/api/internal/spec-ingestions`) ;
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
│   ├── spec-ingestion.model.js          # Snapshot d'ingestion et cycle versionné des modules
│   ├── spec-ingestion-item.model.js     # Items atomiques, revue humaine et affectations modules
│   ├── testplan.model.js                # Plans TP-* avec module, type, couverture et preuves
│   ├── testcase.model.js                # Cas de test normalisés TC-*
│   ├── testsuite.js                     # Suites de test
│   ├── TestExecution.model.js           # Historique d'exécutions Selenium
│   ├── user.model.js                    # Modèle utilisateur et refresh tokens
│   ├── role.model.js                    # Rôles RBAC
│   ├── action.model.js                  # Actions permissionnées
│   └── magictoken.model.js              # Jetons à usage unique / OTP
├── src/routes/                          # Déclaration des endpoints et middlewares
│   ├── spec-ingestion-internal.routes.js# Snapshot, revue et lease de génération des modules
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
| Service FastAPI / Interne | `FASTAPI_BASE_URL`, `FASTAPI_SECRET`, `INTERNAL_API_TOKEN`, `FASTAPI_TIMEOUT_MS` ; compatibilité héritée : `FASTAPI_GENERATION_TIMEOUT_MS`, `PYTHON_API_URL` |
| Email | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `FRONTEND_URL` |
| Exécution / traduction | `EXECUTION_MODEL_TIMEOUT_MS`, `FASTAPI_TRANSLATOR_TIMEOUT_MS` et variables d'authentification Selenium/Jira |

`FASTAPI_TIMEOUT_MS` couvre l'upload, la génération/régénération des modules et plans, puis la génération des cas. L'exemple fournit `420000` ms afin qu'une génération OpenRouter ne soit pas interrompue prématurément par Axios. `FASTAPI_SECRET` est envoyé par Node à FastAPI ; `INTERNAL_API_TOKEN` protège l'API interne Node appelée par FastAPI. Dans l'installation standard, les deux services doivent partager les mêmes valeurs attendues de part et d'autre.

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
| Ingestion Interne | `PUT /api/internal/spec-ingestions/:specHash`<br>`GET /api/internal/spec-ingestions/:specHash`<br>`GET /api/internal/spec-ingestions/:specHash/review-queue`<br>`PATCH /api/internal/spec-ingestions/:specHash/items/:itemId/review`<br>`POST /api/internal/spec-ingestions/:specHash/module-generation/claim`<br>`PUT /api/internal/spec-ingestions/:specHash/module-generation/:lease`<br>`POST /api/internal/spec-ingestions/:specHash/module-generation/:lease/fail` | Protégé par `requireInternalToken` (`X-Internal-Token`). |
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
| `TestPlan` | Collection normalisée liée à une suite. ID métier (`TP-*`), `module`, `moduleId`, `planKind` (`functional|quality`), `coverageStatus` (`ready|needs_review`), preuves typées, objectif, périmètre, priorité et exigences. Index unique `(testSuiteId, id)`. |
| `TestCase` | Lié à une suite et un plan. ID métier (`TC-*`), étapes, `stepDetails`, données de test, priorité/sévérité/type et auteur. Index unique `(testSuiteId, planId, id)`. |
| `TestExecution` | Identifiant d'exécution, statuts, logs, captures, résultats par étape, navigateur et durée. |
| `SpecIngestion` | Stockage persistant de l'ingestion et du cycle modules : `moduleStatus`, `moduleVersion`, `moduleAlgorithmVersion`, empreinte des preuves, dates, erreur, lease, résumé de couverture et cartes modules. Index unique `{ specHash: 1 }`. |
| `SpecIngestionItem` | Items atomiques avec rôle/revue et affectations modules séparées : `moduleIds`, `primaryModuleId`, `moduleMethod`, score, marge, `moduleDisposition` et version d'algorithme. Index unique `{ specHash: 1, itemId: 1 }`. |
| `MagicToken` | Jeton/OTP de reset, à usage unique, avec TTL MongoDB. |

Les métadonnées QA sont normalisées dans `utils/test-artifact-fields.js` : priorités `low|medium|high|critical`, sévérités `trivial|minor|major|critical|blocker` et types de cas (functional, regression, e2e, api, ui, etc.).

### Cycle de vie et invariants des modules

Les cartes modules ont un identifiant stable, un nom, une description, un `kind` (`functional` ou `quality`) et leurs `source_item_ids`. Un module `quality` regroupe les préoccupations non fonctionnelles transverses ; il ne signifie pas « non testable ». Il produit un plan de qualité dont les preuves conservent leur rôle `NON_FUNCTIONAL`. Les critères `ACCEPTANCE` peuvent également contribuer à un plan fonctionnel.

`moduleStatus` représente l'état du snapshot :

| Statut | Signification |
|---|---|
| `pending` | L'ingestion est prête, mais aucun snapshot module valide n'a encore été généré. |
| `generating` | FastAPI détient un lease et calcule cartes, affectations et couverture. |
| `ready` | Le snapshot module est utilisable et sa couverture ne demande pas de revue. |
| `needs_review` | Le snapshot est utilisable, mais des éléments ambigus/non affectés exigent une revue. |
| `failed` | La tentative a échoué ; `moduleGenerationError` contient un message borné. |
| `stale` | Une décision humaine a modifié une preuve structurante ; le prochain `ensure` doit régénérer. |

Une affectation d'item utilise l'une des dispositions `assigned`, `unassigned`, `cross_cutting` ou `excluded`. `assigned` exige exactement un module primaire ; `cross_cutting` exige au moins deux identifiants de module. Le commit doit fournir une disposition pour chaque item du snapshot, ne peut référencer ni item ni module inconnu, accepte au plus 12 modules et incrémente `moduleVersion` uniquement après validation.

### Contrat interne de génération des modules

1. `POST .../module-generation/claim` reçoit `fingerprint`, `algorithm_version` et `force`. Sans `force`, Node réutilise un snapshot `ready|needs_review` si l'empreinte et la version d'algorithme correspondent.
2. Sinon, Node passe atomiquement à `generating` et retourne un `lease`. Un lease bloqué peut être repris après 10 minutes ; une génération concurrente est signalée par `in_progress: true`.
3. `PUT .../module-generation/:lease` reçoit les cartes, toutes les affectations, la couverture, l'empreinte, la version d'algorithme et le statut final. Un lease expiré/invalide retourne `409`.
4. `POST .../module-generation/:lease/fail` libère le lease, marque le snapshot `failed` et conserve l'erreur pour diagnostic.

La lecture `GET /api/internal/spec-ingestions/:specHash` renvoie les items et les champs snake_case `modules`, `module_status`, `module_version`, `module_algorithm_version`, `module_evidence_fingerprint` et `module_coverage` utilisés par FastAPI.

---

## Flux métier principaux

### 1. Ingestion résiliente & revue humaine

1. `python-2026` reçoit une spécification `.docx`, effectue l'extraction, l'itemisation et le tagging déterministe des rôles, puis persiste les items avec `modules: []` et `moduleStatus: pending`. L'upload ne contacte ni OpenRouter ni un modèle d'embedding.
2. Lors de `POST /generate-plan`, FastAPI calcule l'empreinte des preuves, réclame un lease en mode `ensure` ou `regenerate`, génère ou réutilise les cartes, affecte les items, valide la couverture, puis commit cartes et affectations via l'API interne.
3. Lorsque l'utilisateur consulte ou résout la file d'attente d'items `UNTAGGED`, `python-2026` délègue les requêtes à `GET /api/internal/spec-ingestions/:specHash/review-queue` et `PATCH /api/internal/spec-ingestions/:specHash/items/:itemId/review`.
4. La résolution met à jour de façon atomique `roleMethod: "human"`, `reviewed: true`, attribue le `requirementId` si nécessaire et passe le snapshot module à `stale` lorsque le rôle résolu peut affecter les modules (`CONTEXT`, `FEATURE`, `REQUIREMENT`, `ACCEPTANCE`, `NON_FUNCTIONAL`).

### 2. Génération des artefacts de test

1. Le frontend envoie une spécification à `/api/ollama/generate-plan`.
2. Pour un nouveau document, `ollama.service` appelle d'abord `/upload-spec`, conserve `specHash`/`sourceSpecHash` sur la suite, puis appelle `/generate-plan` avec le header `X-Internal-Token` et `module_mode=ensure`. Une demande `regenerate=true` envoie `module_mode=regenerate`.
3. `python-2026` assure le snapshot module, puis assemble les plans de manière déterministe depuis les items persistés. Un conflit de lease remonte en `409` avec le code `MODULE_GENERATION_IN_PROGRESS` ; un timeout FastAPI est traduit en `504`.
4. Node normalise et enregistre `moduleId`, `planKind`, `coverageStatus`, exigences et preuves dans `TestPlan`. La réponse client expose aussi `pendingReviewCount`, `modules`, `moduleStatus`, `moduleVersion`, `moduleCoverage` et `skippedModules`.
5. La génération de cas transmet `plan_module_id` à FastAPI afin de filtrer les preuves par identifiant stable. Les plans de qualité peuvent ainsi produire des cas ou contrôles issus des exigences non fonctionnelles au lieu d'être automatiquement déclarés non testables.

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
- Ne pas réintroduire la génération des modules, OpenRouter ou les embeddings dans `/upload-spec` ; ce travail appartient à `/generate-plan`.
- Conserver le protocole claim/lease/commit : ne jamais écrire un snapshot module partiel directement depuis FastAPI.
- Préserver les identifiants de module stables lors d'une régénération et utiliser `moduleId`, pas seulement le nom affiché, pour relier plans, preuves et cas.
- Toute nouvelle disposition doit rester exhaustive : chaque item doit être `assigned`, `cross_cutting`, `unassigned` ou `excluded` au moment du commit.
- Traiter `quality` comme une catégorie de plan testable/adaptable (performance, sécurité, accessibilité, résilience, etc.), avec `needs_review` lorsque la preuve ne permet pas encore de définir un contrôle vérifiable.
