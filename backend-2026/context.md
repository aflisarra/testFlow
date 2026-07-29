# `backend-2026` — contexte du projet

> Analyse réalisée le 2026-07-24. Ce document décrit l'état constaté du code, pas une cible d'architecture.

## Vue d'ensemble

`backend-2026` est l'API Node.js du produit de gestion et d'automatisation de tests. Elle fournit :

- l'authentification JWT, les rôles et les permissions par action ;
- les utilisateurs, projets et invitations d'équipe ;
- les suites, plans et cas de test stockés dans MongoDB ;
- la génération de plans/cas par le backend FastAPI voisin (`python-2026`) ;
- l'exécution Selenium/Chrome de cas de test, l'annulation et l'historique d'exécution ;
- l'export Word des plans et un rapport PDF d'historique d'exécution ;
- les flux de réinitialisation de mot de passe par email/OTP.

La stack est Express 5 en CommonJS, Mongoose 7/MongoDB et Selenium WebDriver. Il n'y a pas d'étape de build : le serveur démarre directement avec `node src/index.js`.

## Structure utile

```text
backend-2026/
├── src/index.js                         # Bootstrap Express, CORS, MongoDB et montage des routes
├── src/models/                          # Schémas MongoDB
├── src/routes/                          # Déclaration des endpoints et middlewares
├── src/controllers/                     # Adaptation HTTP
├── src/services/                        # Logique métier et intégrations externes
│   ├── selenium/                        # Chrome, décisions AI, actions UI/API, rapports PDF
│   └── export-word/                     # Génération DOCX
├── src/middleware/                      # Auth, permissions, accès projet/suite, upload
├── src/utils/                           # Normalisation des artefacts, JWT, upload de spécifications
├── src/migrations/                      # Migration de métadonnées plans/cas
├── src/database/                        # Seeders et migrations historiques
├── test/                                # Tests node:test (unitaires/modèles uniquement)
├── uploads/                             # Avatars, spécifications et captures à l'exécution
├── public/selenium-screenshots/         # Capture présente dans le dépôt
├── .env.example
└── package.json
```

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
| Service FastAPI | `FASTAPI_BASE_URL`, `FASTAPI_SECRET`, `FASTAPI_TIMEOUT_MS`, `FASTAPI_GENERATION_TIMEOUT_MS`, `PYTHON_API_URL` |
| Email | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `FRONTEND_URL` |
| Exécution / traduction | `EXECUTION_MODEL_TIMEOUT_MS`, `FASTAPI_TRANSLATOR_TIMEOUT_MS` et, selon les cibles API, les variables Basic Auth/Jira/Atlassian listées dans `services/selenium/api.executor.js` |

`.env.example` ne documente qu'une partie de ces variables. Ne jamais placer de secret dans ce fichier de contexte.

## Architecture HTTP et sécurité

`src/index.js` charge explicitement `.env`, configure CORS avec une liste blanche (`CORS_ORIGINS`, sinon `http://localhost:4200` et `http://localhost:3000`), sert `uploads/` sous `/api/uploads`, puis monte les routes.

Pour chaque requête qui porte un Bearer token valide, un middleware global émet un nouvel access token dans `x-new-token`. Les access tokens expirent après 1 h ; les refresh tokens, stockés dans le document `User`, expirent après 7 jours.

`authenticateUser` met le payload JWT dans `req.user`. `requireAction` recharge le rôle depuis MongoDB afin que les changements de permissions prennent effet sans reconnexion. Les actions ont des identifiants numériques stables (1 à 17) : ne pas les renuméroter sans coordonner frontend, seeders et routes.

Accès aux ressources :

- une suite sans projet est accessible à son créateur ;
- une suite rattachée à un projet requiert owner ou membre assigné, invitation acceptée et une permission liée au projet ;
- `admin` contourne le garde d'accès aux suites ;
- l'accès projet admet owner et utilisateurs de `assignedUsers`.

## Endpoints montés

Tous les chemins ci-dessous sont relatifs au serveur (préfixe `/api` sauf indication contraire).

| Domaine | Endpoints principaux | Protection constatée |
|---|---|---|
| Auth | `GET /auth/signup-roles`, `POST /auth/signup`, `/auth/signin`, `/auth/logout`, `/auth/refresh-token` | Publics. Le premier inscrit devient `admin`; les suivants ne peuvent pas choisir `admin`. |
| Réinitialisation | `POST /auth/forgot-password`, `/auth/verify-magic-token`, `/auth/verify-otp`, `/auth/reset-password` | Publics, hors préfixe `/api`; JWT à usage unique + OTP hashé en MongoDB. |
| Utilisateurs | `GET /users/profile`, CRUD `/users` | JWT ; la plupart des mutations/liste demandent des action IDs. |
| Rôles / actions | CRUD `/roles`, `POST /roles/reassign-delete`, `GET /actions` | Rôles : JWT, mais `reassign-delete` n'a pas de `requireAction`. Actions : public. |
| Projets | CRUD `/projects`, `PATCH /projects/:id/users`, `GET /projects/:id/usersProject` | JWT + actions (sauf `usersProject`, qui n'a pas de garde d'accès projet). |
| Invitations | `GET /project-invitations`, `POST /:id/accept`, `POST /:id/ignore` | JWT. |
| Suites | CRUD `/testsuites`, plans/cas, session/statuts, projet, exécution et export Word | JWT sur le routeur ; les opérations par `:id` sensibles ont `requireTestSuiteAccess`. |
| Génération AI | `GET /ollama/health`, `POST /ollama/chat`, `/ollama/generate-plan`, `/ollama/generate-test-cases`, `/ollama/cancel-generation` | Aucun middleware d'authentification. |
| Selenium | `POST /selenium/run-test-case`, liste/détail d'exécutions, annulation, rapport PDF | JWT au niveau routeur. |
| Analyse de panne AI | `POST /ai/detect-failure`, `/ai/get-fix-suggestion` | Aucun middleware d'authentification. |
| Redirection de rôle | `GET /auth-redirect` | JWT. |

Les routes de suite importantes sont notamment :

```text
POST/GET                 /api/testsuites
GET                      /api/testsuites/user/:userId
GET                      /api/testsuites/project/:projectId
GET/PUT/DELETE           /api/testsuites/plans/:id
POST/GET                 /api/testsuites/plans/:testPlanId/cases
PUT/DELETE               /api/testsuites/cases/:id
GET/POST                 /api/testsuites/:id/plans
GET                      /api/testsuites/:id/executions
PATCH                    /api/testsuites/:id/session|status|save|project
POST                     /api/testsuites/:id/execute
GET/POST                 /api/testsuites/:id/export-word
POST                     /api/testsuites/preview
POST                     /api/testsuites/save-plans
```

`src/routes/specification.routes.js` existe (lecture/édition HTML d'une spécification) mais n'est **pas monté dans `src/index.js`** : ses endpoints ne sont actuellement pas accessibles.

## Modèle de données

| Collection | Responsabilité / relations |
|---|---|
| `User` | `name`, `email`, mot de passe hashé, avatar, langue, rôle et refresh token. `roleId` est un ObjectId mais une migration protège les données legacy. |
| `Role`, `Action`, `RoleAction` | Rôle avec liste d'action IDs numériques ; table de liaison legacy. Les seeders créent `admin`, `user`, `management`. |
| `Project` | Propriétaire, membres assignés, dates et statut (`draft`, `active`, `paused`, `completed`). |
| `ProjectInvitation` | Invitation unique `(projectId, userId)` avec statut `pending`, `accepted`, `ignored`, `revoked`. |
| `TestSuite` | Métadonnées de suite, chemin/texte de spécification, URL cible, projet, statut de session/validation/exécution et suivi de dernière action. |
| `TestPlan` | Collection normalisée liée à une suite. ID métier (`TP-*`), objectif, périmètre, priorité et exigences. Index unique `(testSuiteId, id)`. |
| `TestCase` | Lié à une suite et un plan. ID métier (`TC-*`), étapes, `stepDetails`, données de test, priorité/sévérité/type et auteur. Index unique `(testSuiteId, planId, id)`. |
| `TestExecution` | Identifiant d'exécution, statuts, logs, captures, résultats par étape, navigateur/environnement, acteurs et durée. |
| `MagicToken` | Jeton/OTP de reset, à usage unique, avec TTL MongoDB. |

Les métadonnées QA sont normalisées dans `utils/test-artifact-fields.js` : priorités `low|medium|high|critical`, sévérités `trivial|minor|major|critical|blocker` et types de cas (functional, regression, e2e, api, ui, etc.).

L'ancien modèle embarqué dans `TestSuite` coexiste partiellement avec les collections `TestPlan` et `TestCase`. Le chemin principal fait une écriture normalisée / dual-write afin de préserver la compatibilité avec l'interface existante.

## Flux métier principaux

### Authentification et RBAC

1. `signup` hache le mot de passe avec bcrypt, crée/récupère le rôle et stocke un utilisateur.
2. `signin` recharge le rôle, émet access + refresh tokens et remplace le refresh token persistant.
3. Les routes protégées vérifient le JWT ; les routes RBAC recalculent les actions autorisées depuis le rôle MongoDB.
4. Le reset par email stocke un JTI et le hash de l'OTP dans `MagicToken`, puis génère un court reset token après vérification.

### Génération des artefacts de test

1. Le frontend envoie une spécification (`.docx`, `.md`, `.txt`, max. 15 MiB) à `/api/ollama/generate-plan`.
2. `ollama.service` extrait le texte. Pour un `.docx`, il crée un ZIP temporaire et utilise `Expand-Archive` de Windows PowerShell, puis lit `word/document.xml`.
3. Le service appelle le FastAPI configuré avec `X-Internal-Token` lorsque `FASTAPI_SECRET` existe.
4. Les réponses sont normalisées, dédupliquées et limitées, puis les plans/cas sont persistés dans `TestPlan`/`TestCase`; les statuts de suite sont mis à jour.
5. Les générations peuvent être annulées via le FastAPI.

Le backend Python voisin est donc un prérequis réel pour la génération, le chat, les décisions AI Selenium et l'analyse de panne.

### Exécution Selenium

1. `POST /api/selenium/run-test-case` prend un cas ou le résout depuis son plan.
2. `selenium.service` crée Chrome avec Selenium, un contrôleur d'annulation et un driver enregistré.
3. `ui.executor` exécute les étapes structurées, peut appeler FastAPI `/ai/decide`, utilise des sélecteurs/fallbacks et prend des captures.
4. Le résultat est enregistré dans `TestExecution` si la suite est un ObjectId valide. Les captures sont écrites dans `uploads/screenshots` et publiées sous `/api/uploads/screenshots/...`.
5. `PATCH /api/selenium/executions/:executionId/abort` annule le driver actif et marque l'exécution `aborted`.

`POST /api/testsuites/:id/execute` lance une exécution de tous les cas en arrière-plan (fire-and-forget) lorsqu'aucun statut explicite n'est envoyé. Il n'y a pas de file de jobs ni de persistance de worker.

### Exports

- `GET|POST /api/testsuites/:id/export-word` génère un `.docx` en mémoire à partir de la suite, ses plans et ses cas.
- `GET /api/selenium/reports/test-suites/:testSuiteId` produit un PDF avec synthèse, historique, logs, captures et analyses AI disponibles.

## Seeders et migrations

`npm run seed` est uniquement un `echo` : il ne lance aucun seeder. Pour initialiser une base, exécuter explicitement et dans cet ordre :

```powershell
node src/database/seeders/seed.actions.js
node src/database/seeders/seed.roles.js
node src/database/seeders/seed.roleActions.js
node src/database/seeders/seed.user.js
```

La migration documentée est :

```powershell
npm.cmd run migrate:test-artifacts
```

Elle ajoute les champs de métadonnées aux collections `testplans`, `testcases` et aux anciennes structures embarquées. La migration `migrate-user-roleid.js` reste utile pour convertir les rôles legacy vers des ObjectIds.

## Validation effectuée

Commande exécutée :

```powershell
npm.cmd test
```

Résultat : **10 tests réussis, 1 test en échec**.

Le test en échec est `TestCase stores objective, preconditions, test data, severity, type and requirements`. Il construit `test_data` comme objet, alors que `src/models/testcase.model.js` le déclare `[String]`. Mongoose échoue avec `Cast to [string] failed`. Il faut choisir et appliquer un contrat unique : données de test structurées (`Mixed`) ou liste de chaînes normalisées.

## Points d'attention prioritaires

1. `testcase.service.js` appelle `normalizeStepDetails()` lors de la création de cas et lors de certaines mises à jour, mais sa seule implémentation est commentée. Un `POST` de création de cas manuel déclenchera donc un `ReferenceError`.
2. `services/specification.service.js` importe `mammoth`, absent de `package.json` et de l'installation actuelle (`npm.cmd ls mammoth --depth=0` est vide). Le module ne peut pas être chargé après une installation propre. De plus, ses routes ne sont pas montées et il écrit `specHtml`/`specHtmlPath`, champs absents du schéma `TestSuite`.
3. Des routes coûteuses ou sensibles sont sans authentification : tout `/api/ollama`, les endpoints `/api/ai/*` et `/api/actions`. `POST /api/roles/reassign-delete` n'a pas non plus de contrôle d'action.
4. Les contrôles d'accès ne sont pas cohérents partout : `GET /api/testsuites` charge toutes les suites et indique seulement `canOpen`; `GET /api/testsuites/project/:projectId`, `GET /api/projects/:id/usersProject` et certaines requêtes Selenium ne vérifient pas systématiquement l'accès à la ressource demandée.
5. `AUTH_README.md` est obsolète : il cite TypeScript, `MONGO_URI`, des routes et un `npm run seed` qui ne correspondent plus au code. Le code et ce `context.md` doivent primer.
6. Le processus Selenium est local, non headless et stateful. Il nécessite Chrome/driver disponibles, une session desktop viable et le FastAPI voisin pour la partie AI. Les exécutions longues ne sont pas distribuées ni reprises après redémarrage.
7. Il n'y a ni linter/formatter configuré, ni tests d'intégration HTTP/MongoDB, ni CI. Les tests présents couvrent surtout les normaliseurs, modèles Mongoose et l'URL de décision AI.

## Conseils pour la prochaine modification

- Préserver les IDs numériques des actions et les IDs métier `TP-*` / `TC-*`.
- Passer par les services pour manipuler plans/cas afin de conserver la normalisation et les index uniques.
- Vérifier les règles d'accès à chaque nouvel endpoint, en particulier si une route accepte un `testSuiteId`, `projectId` ou `executionId` fourni par le client.
- Pour toute évolution de génération/exécution AI, tester avec MongoDB, le backend Python et Chrome actifs ; les seuls tests Node ne couvrent pas ces intégrations.
- Si le schéma ou le format des artefacts change, mettre à jour à la fois `utils/test-artifact-fields.js`, les modèles, les chemins de dual-write, les migrations et les tests.
