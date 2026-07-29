# context.md — python-2026 : état du projet

> Généré le 2026-07-01. À mettre à jour à chaque session.

---

## Vue d'ensemble

**python-2026** est un backend **FastAPI** (Python) qui expose une API REST pour :

1. Extraire le texte d'une spec `.docx`
2. Générer des **Test Plans** (TP-N) via un LLM OpenRouter
3. Générer des **Test Cases** (TC-N.N) par plan
4. Prendre des **décisions AI** step-by-step pour l'automatisation UI (Selenium)
5. **Exécuter** des test cases via Selenium + décision AI
6. **Annuler** une génération en cours

Le LLM utilisé est **OpenRouter**, appelé via HTTP.

---

## Structure du projet

```
python-2026/
├── main.py                        # Point d'entrée FastAPI (v2.0.0)
├── requirements.txt               # Dépendances (fastapi, uvicorn, python-dotenv, python-docx, python-multipart)
├── .env.example                   # Variables d'environnement documentées
├── core/
│   ├── config.py                  # Settings dataclass (frozen), chargée depuis env
│   └── constants.py               # PRIORITIES, SEVERITIES, TEST_CASE_TYPES, limites min/max
├── routers/
│   ├── health.py                  # GET /health
│   ├── test_plans.py              # POST /upload-spec, POST /generate-plan
│   ├── test_cases.py              # POST /generate-test-cases
│   ├── ai_decision.py             # POST /ai/decide  (décision AI step-by-step)
│   ├── test_runner.py             # POST /test-runner/run  (exécution Selenium)
│   └── cancellation.py            # POST /cancel-generation
├── services/
│   ├── ai_service.py              # AiService (generate_json + repair JSON)
│   ├── plan_service.py            # generate_test_plans()
│   ├── case_service.py            # generate_test_cases()
│   ├── spec_service.py            # extract_spec_text, chunk_spec, extract_requirements
│   ├── cancellation_service.py    # request_cancel(), is_cancelled() (TTL-based, thread-safe)
│   ├── ai/
│   │   └── ai_service.py          # AIService secondaire (appel HTTP direct Ollama, format=json)
│   └── selenium/
│       └── selenium_service.py    # run_test() — orchestration Selenium + appels /ai/decide
├── schemas/
│   ├── test_plan_schema.py        # GeneratePlanRequest, GeneratePlanResponse
│   └── test_case_schema.py        # GenerateTestCasesRequest, TestCasesResponse
├── prompts/
│   ├── test_plan_prompt.py        # build_test_plan_prompt()
│   ├── test_case_prompt.py        # build_test_case_prompt()
│   ├── ai_decision_prompt.py      # build_ai_decision_prompt()
│   └── validate.prompt.py         # (mini prompt de validation)
├── utils/
│   ├── openrouter.py              # run_openrouter() : HTTP, timeout-safe
│   ├── json_cleaner.py            # safe_json_loads() : robuste aux sorties LLM
│   ├── chunker.py                 # split_by_headings(), detect_modules_from_chunks()
│   ├── docx_reader.py             # extract_text_from_docx()
│   └── logger.py                  # get_logger(), log_event(), log_error() (JSON structuré)
└── automation/
    └── dom_capture.py             # capture_dom_elements() + resolve_indexed_selector() (Selenium JS)
```

---

## Endpoints disponibles

| Méthode | Route | Description |
|---------|-------|-------------|
| `GET` | `/` | Health check + liste des endpoints |
| `GET` | `/health` | Status + modèle + mock_mode |
| `POST` | `/upload-spec` | Upload `.docx` → extrait `spec_text` |
| `POST` | `/generate-plan` | Génère les Test Plans (TP-1..TP-N) |
| `POST` | `/generate-test-cases` | Génère les Test Cases d'un plan |
| `POST` | `/ai/decide` | Décision AI pour une step UI (step + DOM → actions) |
| `POST` | `/test-runner/run` | Exécute un test case via Selenium |
| `POST` | `/cancel-generation` | Annule une génération en cours |
| `POST` | `/chat` | Chat libre avec OpenRouter |

---

## Ce qui est implémenté et fonctionnel

### Coeur métier
- **Extraction spec** : lecture `.docx`, normalisation texte, chunking par headings, extraction requirements (bullets, modal verbs, user stories)
- **Détection modules** : heuristique par keywords (Auth, Users, CRUD, Search, Notifications, Reporting, Security, Performance, Accessibility, Payments)
- **Génération Test Plans** : prompt → OpenRouter → parse JSON → normalisation, déduplication, renumérotation, fallback mock si trop peu de plans
- **Génération Test Cases** : prompt → OpenRouter → parse JSON → normalisation fields (priority, severity, type, stepDetails avec expected_result par étape), fallback mock
- **Linking requirements** : pertinence par keywords entre plan/case et exigences extraites

### AI Decision (step-by-step UI automation)
- Endpoint `/ai/decide` reçoit : `step` (texte), `dom` (liste structurée d'éléments), `test_case`
- **Détection fill step** vs **click step** par keywords
- **Fallback DOM → actions** : si le LLM échoue ou retourne des actions invalides, construit les actions `type`/`click` directement depuis la liste DOM
  - Extraction test_data depuis de multiples formes (snake_case, camelCase, nesting, credentials)
  - Valeurs sémantiques par champ (email, password, phone, date, address...)
  - Defaults hardcodés (John, john@test.com, John@test123...)
  - Inférence test_data depuis le DOM si test_data absent
- **Anti-wrong-click** : détecte si le LLM retourne des clicks alors que des inputs existent → force le fallback fill

### Selenium test runner
- `run_test(test_case)` : ouvre Chrome, navigue vers `test_case.url`, exécute chaque step
- Par step : capture le DOM via JS → appelle `/ai/decide` → exécute les actions retournées
- `smart_find()` : résout les sélecteurs CSS, avec fallback `label[for=...]` et `__index:N`
- `capture_dom_elements()` : snapshot JS structuré (input/button/a/textarea/select) des éléments visibles, max 150
- `resolve_indexed_selector()` : résout `__index:N` via XPath positionnel
- Screenshots à chaque action (step_N_M.png / error_N_M.png)
- Fermeture propre du driver (finally → `driver.quit()`)

### Annulation
- Service in-memory thread-safe avec TTL (15 min par défaut)
- Annulation par `(test_suite_id, plan_id, scope)` ou par `request_id`
- Checked avant et après l'appel AI dans `/generate-plan` et `/generate-test-cases`
- One-shot consume : une annulation n'est consommée qu'une fois (évite de bloquer les runs suivants)

### Utilitaires
- **openrouter.py** : HTTP API, timeout-safe, extraction JSON robuste
- **json_cleaner.py** : `safe_json_loads()` : direct → strip fences → extract balanced → repair trailing commas
- **ai_service.py** : `generate_json()` avec repair-loop (un second appel OpenRouter si le JSON est invalide), logging structuré
- **logger.py** : JSON structuré sur stdout, configurable via `LOG_LEVEL`

### Configuration
- `core/config.py` : `Settings` dataclass frozen, tous les timeouts configurables via env
- Variables disponibles : `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` / `MODEL_NAME`, `OPENROUTER_TIMEOUT`, `OPENROUTER_CHAT_TIMEOUT`, `OPENROUTER_TEST_PLANS_TIMEOUT`, `OPENROUTER_TEST_CASES_TIMEOUT`, `OPENROUTER_TEST_TRANSLATOR_TIMEOUT`, `OPENROUTER_HTTP_TIMEOUT`, `OPENROUTER_NUM_PREDICT`, `OPENROUTER_TEMPERATURE`, `USE_MOCK`, `DEBUG_ERRORS`, `LOG_LEVEL`
- **Mock mode** (`USE_MOCK=true`) : retourne des données statiques sans appeler OpenRouter

---

## Ce qui est manquant / TODO

### Bugs connus
- `main.py` ligne 84 : référence à `resolved_test_case` dans le handler `GET /` → erreur au runtime si appelé (variable non définie dans ce scope)
- `services/ai/ai_service.py` : importe `from json_utils import safe_json_loads` → module inexistant (`utils.json_cleaner` est le bon)
- Duplication d'imports dans `routers/test_plans.py` (Form, UploadFile, File importés deux fois)

### Qualité / Robustesse
- Pas de `pyproject.toml` (pas de ruff, black, mypy configurés)
- Pas de tests automatisés (ni smoke, ni unit, ni integration)
- Pas de CI (GitHub Actions)
- `requirements.txt` sans versions figées → risque de régression
- CORS ouvert (`allow_origins=["*"]`) → à restreindre en production
- L'endpoint `translate-test-case` est commenté (`#app.include_router(test_case_translator.router)`)

### Améliorations planifiées (README checklist)
- [ ] Script de lancement standard (Makefile / PowerShell)
- [ ] `pyproject.toml` avec ruff, black, pytest
- [ ] Lockfile ou versions figées
- [ ] Tests minimaux (health check, upload .docx, mock generation)
- [ ] CI GitHub Actions (install → lint → test)
- [ ] Dockerfile + `.dockerignore`
- [ ] Environnements dev/prod explicites
- [ ] Monitoring basique (latence, erreurs 5xx, timeouts)
- [ ] Retry/backoff sur appels externes

---

## Flux de données principal

```
[Frontend Angular]
      │
      ├─ POST /upload-spec (.docx) ──► spec_service ──► docx_reader ──► spec_text
      │
      ├─ POST /generate-plan ─────────► plan_service
      │                                     ├─ spec_service (chunk + modules + requirements)
      │                                     ├─ build_test_plan_prompt()
      │                                     └─ AiService.generate_json() ──► run_openrouter() ──► OpenRouter HTTP
      │
      ├─ POST /generate-test-cases ───► case_service
      │                                     ├─ spec_service (chunk + requirements)
      │                                     ├─ build_test_case_prompt()
      │                                     └─ AiService.generate_json() ──► run_openrouter() ──► OpenRouter HTTP
      │
      └─ POST /test-runner/run ───────► selenium_service.run_test()
                                            ├─ webdriver.Chrome()
                                            ├─ [per step] capture_dom_elements()
                                            ├─ POST /ai/decide ──► build_ai_decision_prompt()
                                            │                   └─► AIService.generate_json() ──► OpenRouter HTTP
                                            │                       (+ DOM fallback si LLM échoue)
                                            └─ smart_find() + send_keys() / click()
```

---

## Dépendances Python

```
fastapi
uvicorn[standard]
python-dotenv
python-docx
python-multipart
# manquants dans requirements.txt mais utilisés :
selenium
requests
```

> ATTENTION : `selenium` et `requests` sont utilisés dans `services/selenium/selenium_service.py` et `services/ai/ai_service.py` mais **absents de requirements.txt**.

---

## Lancement

```bash
# 1. Créer et activer venv
python -m venv .venv
.venv\Scripts\activate

# 2. Installer les dépendances
pip install -r requirements.txt
pip install selenium requests  # manquants dans requirements.txt

# 3. Configurer l'environnement
copy .env.example .env
# éditer .env

# 4. Configurer la clé API OpenRouter
 # export OPENROUTER_API_KEY=sk-or-...

# 5. Lancer l'API
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```
