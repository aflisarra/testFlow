# context.md — python-2026 : état du projet

> Mis à jour le 2026-07-30.

---

## Vue d'ensemble

**python-2026** est un backend **FastAPI** (Python) qui sert de microservice d'IA et d'automatisations NLP/Selenium pour l'API principale **`backend-2026`** (Express.js / Node.js). Il expose une API REST pour :

1. Extraire et découper le texte d'une spec `.docx` (chunking récursif structuré, itemisation atomique & classification hybride)
2. Ingestion complète (Phase 2 à 4) : itemisation, classification en cascade des rôles (`tag_role`) et extraction générative des modules par spec (`generate_module_list`, `tag_module`)
3. Générer des **Test Plans** (TP-N) via un LLM OpenRouter
4. Générer des **Test Cases** (TC-N.N) par plan
5. Prendre des **décisions AI** step-by-step pour l'automatisation UI (Selenium)
6. **Exécuter** des test cases via Selenium + décision AI
7. **Annuler** une génération en cours

Le LLM principal utilisé est **OpenRouter** (ex. `google/gemini-2.5-flash`), appelé via HTTP.
Pour l'embedding et l'alignement sémantique (Rôles & Modules), le système s'appuie sur `sentence-transformers` (`paraphrase-multilingual-MiniLM-L12-v2`) et `scipy` pour l'alignement de Hungarian.


---

## Structure du projet

```
python-2026/
├── main.py                        # Point d'entrée FastAPI (v2.0.0)
├── requirements.txt               # Dépendances (fastapi, uvicorn, python-dotenv, python-docx, python-multipart, scipy, sentence-transformers, openai)
├── .env.example                   # Variables d'environnement documentées
├── probe_classifier.ipynb         # Notebook d'expérimentation (Ground Truth, Role/Module classifier, Module Generation, Hungarian alignment)
├── core/
│   ├── config.py                  # Settings dataclass (frozen), chargée depuis env
│   └── constants.py               # PRIORITIES, SEVERITIES, TEST_CASE_TYPES, limites min/max
├── routers/
│   ├── health.py                  # GET /health
│   ├── test_plans.py              # POST /upload-spec, POST /generate-plan, GET /debug/items/{spec_hash}
│   ├── test_cases.py              # POST /generate-test-cases
│   ├── ai_decision.py             # POST /ai/decide  (décision AI step-by-step)
│   ├── test_runner.py             # POST /test-runner/run  (exécution Selenium)
│   └── cancellation.py            # POST /cancel-generation
├── services/
│   ├── ai_service.py              # AiService (generate_json + repair JSON via OpenRouter)
│   ├── plan_service.py            # generate_test_plans()
│   ├── case_service.py            # generate_test_cases()
│   ├── spec_service.py            # extract_spec_text, chunk_docx_bytes, filter_srs_sections, extract_requirements
│   ├── cancellation_service.py    # request_cancel(), is_cancelled() (TTL-based, thread-safe)
│   ├── ingestion/                 # Pipeline d'ingestion (Phases 2-4)
│   │   ├── __init__.py
│   │   ├── items.py               # Modèle Item, in-process store (_STORE, store_items, get_items), expand_section_to_items()
│   │   ├── role_rules.py          # Règles lexicales / regex par rôle (Pass 1)
│   │   ├── role_heading_prior.py   # Detection par mots-clés sur le titre parent direct (Pass 2)
│   │   ├── tagger.py              # Classifier de rôles tag_role() (regex -> heading -> UNTAGGED, sans fallback embedding)
│   │   ├── module_generation.py   # Extraits de preuve & appel LLM pour générer les cartes modules spec-local
│   │   ├── module_tagger.py       # Alignement et tagging des items sur les modules générés (tag_module)
│   │   ├── module_gold.py         # Registre Gold pour l'alignement de Hungarian
│   │   ├── module_validation.py   # Fonctions de comparaison (legacy vs généré) & scoring Hungarian
│   │   └── ingest.py              # Pipeline complet ingest_spec() (sha256, cache, itemisation, roles, modules, logging structuré)
│   ├── ai/
│   │   └── ai_service.py          # AIService secondaire (OpenRouter HTTP)
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
│   ├── chunker.py                 # chunk_spec_recursive(), build_heading_tree(), _heading_level_of(), split_by_headings()
│   ├── docx_reader.py             # extract_text_from_docx(), extract_doc_from_bytes()
│   └── logger.py                  # get_logger(), log_event(), log_error() (JSON structuré)
├── tests/                         # Suite de tests unitaires et d'intégration
│   ├── test_chunker.py            # Tests du chunking récursif
│   ├── test_role_tagger.py        # Tests du classifier de rôles en cascade
│   ├── test_module_generation.py  # Tests de génération et tagging des modules
│   └── pipeline_smoke.py          # Smoke test d'ingestion bout-en-bout
└── automation/
    └── dom_capture.py             # capture_dom_elements() + resolve_indexed_selector() (Selenium JS)
```

---

## Endpoints disponibles

| Méthode | Route | Description |
|---------|-------|-------------|
| `GET` | `/` | Health check + liste des endpoints |
| `GET` | `/health` | Status + modèle + mock_mode |
| `POST` | `/upload-spec` | Upload `.docx` → extrait `spec_text`, exécute `ingest_spec()` (itemisation, rôles, modules) et retourne `item_count` |
| `GET` | `/debug/items/{spec_hash}` | Inspecte le store d'items (count + sample structuré) pour un hash donné |
| `POST` | `/generate-plan` | Génère les Test Plans (TP-1..TP-N) |
| `POST` | `/generate-test-cases` | Génère les Test Cases d'un plan |
| `POST` | `/ai/decide` | Décision AI pour une step UI (step + DOM → actions) |
| `POST` | `/test-runner/run` | Exécute un test case via Selenium |
| `POST` | `/cancel-generation` | Annule une génération en cours |
| `POST` | `/chat` | Chat libre avec OpenRouter |

---

## Ce qui est implémenté et fonctionnel

### 1. Chunking récursif sensible aux titres (`utils/chunker.py`)
- **Arbre de titres (`HeadingNode`)** : parcours unique de l'arbre documentaire. Les paragraphes d'introduction situés entre un titre parent et son premier sous-titre sont attribués au parent via `own_paragraphs`.
- **Support bilingue & outline XML** : détection des styles `Heading 1..6` (Anglais), `Titre 1..6` (Français) et fallback sur l'attribut XML `<w:outlineLvl>`.
- **Propagation d'ancêtres (`heading_path`)** : chaque chunk conserve le chemin complet des titres ancêtres (ex: `["2. Fonctionnalités", "2.1 Authentification"]`).

### 2. Ingestion & Itemisation atomique (Phase 2 - `services/ingestion/`)
- **Modèle `Item`** (`id`, `source_chunk_id`, `heading_path`, `text`, `role`, `role_method`, `module`, `role_score`, `module_score`).
- **Stratégie de découpage 2-pass (`expand_section_to_items`)** :
  1. Extraction des puces (regex `-`, `*`, `•`, numérotation `1.`, `1)`).
  2. Découpage des blocs de prose restants aux frontières de phrases (`. `, `! `, `? ` pour les candidats >= 20 caractères).
  3. Filtrage des items de longueur < 10 caractères.
- **Store in-process (`_STORE`)** : indexé par `spec_hash` (digest SHA-256 du fichier).

### 3. Classifier de Rôles en cascade (Phase 3 - `services/ingestion/tagger.py`)
- **Cascade (première correspondance gagnante)** :
  1. **Regex déterministe (`role_rules.py`)** : détection immédiate des puces, exigences modales, critères BDD/UC, hors périmètre, glossaires → `method="regex"`.
  2. **Prior du titre parent (`role_heading_prior.py`)** : inspection des mots-clés du titre parent immédiat (ex: `ACTOR`, `GLOSSARY`, `CONTEXT`) → `method="heading"`.
  3. **Défaut** : `UNTAGGED` → `method="none"`.
- **Désactivation du fallback d'embedding** : Le fallback k-NN par embedding vectoriel a été retiré de `tag_role()` car il produisait du bruit et de fausses classifications. Seules les règles explicites (regex) et la structure documentaire (titres) déterminent désormais le rôle.
- Chaque item conserve la méthode ayant produit son étiquette dans `item.role_method`.

### 4. Génération & Classification des Modules par Spec (Phase 4 - `services/ingestion/module_*`)
- **Extraction générative des modules (`module_generation.py`)** : sélection d'un budget d'items de preuve (`CONTEXT`, `FEATURE`, `REQUIREMENT`, `NON_FUNCTIONAL`) transmis à OpenRouter pour générer la liste des modules spécifiques à la spec `{name, description}`.
- **Tagging des items par module (`module_tagger.py`)** : comparaison cosine similarity entre le texte de chaque item et la description générée des modules.
- **Évaluation Hungarian Alignment (`module_validation.py` & `module_gold.py`)** : calcul de la matrice de coût d'assignation globale (`scipy.optimize.linear_sum_assignment`) contre une liste Gold de référence (score d'alignement moyen : **0.618**, couverture 11/13 ≥ 0.50).
- **Détection des sous-modules sur-découpés (`flag_tiny_modules`)** : alerte sur les modules ayant < 2 items attribués.

### 5. Coeur métier & Génération LLM
- **Génération Test Plans & Cases** : prompts structurés avec fallback mock, déduplication et renumérotation.
- **Linking requirements** : association par mots-clés entre exigences extraites et plans/cases.

### 6. AI Decision & Selenium Test Runner
- Exécution UI automatisée avec capture DOM, smart finding CSS/XPath positionnel, et screenshots par étape.
- Fallback automatique du DOM si le LLM ne produit pas d'actions valides.

### 7. Annulation
- Système thread-safe in-memory avec TTL (15 min) et consommateur unique (one-shot).

---

## Ce qui est manquant / TODO

### Industrialisation & Étape suivante (Phase 5)
- **Filtrage contextuel par tâche (Phase 5)** : connecter `filter_items()` au prompt builder de `generate_test_plans` et `generate_test_cases` pour restreindre le contexte LLM aux items pertinents par rôle et module.
- Pas de `pyproject.toml` (ruff, black configurés).
- CORS ouvert (`allow_origins=["*"]`) → à restreindre pour la prod.

---

## Intégration et contrat avec `backend-2026`

`python-2026` fonctionne comme un microservice AI/NLP pour l'API principale **`backend-2026`** (Express 5 / Node.js sur le port 3000).

### 1. Rôle dans l'architecture global
- **`backend-2026` (Port 3000)** : API d'orchestration pour le frontend Angular. Il gère l'authentification JWT, le RBAC, les utilisateurs et projets, la persistance MongoDB (`TestSuite`, `TestPlan`, `TestCase`, `TestExecution`), l'upload des spécifications, l'historique d'exécution Selenium et l'export DOCX / PDF.
- **`python-2026` (Port 8000)** : Microservice spécialisé en IA (FastAPI). Il réalise l'ingestion et le découpage de documents (`.docx`), l'itemisation atomique, la classification en cascade des rôles et modules, la génération de plans/cas de test via OpenRouter LLM, et fournit les décisions AI step-by-step pour Selenium.

### 2. Endpoints sollicités par `backend-2026`
Dans le fonctionnement global de l'application, `backend-2026` agit comme un proxy et un orchestrateur qui appelle `python-2026` :
- **Génération & Annulation** (`backend-2026/src/services/ollama.service.js`) :
  - `POST /generate-plan` (invoqué via `POST /api/ollama/generate-plan`)
  - `POST /generate-test-cases` (invoqué via `POST /api/ollama/generate-test-cases`)
  - `POST /cancel-generation` (invoqué via `POST /api/ollama/cancel-generation`)
- **Décisions Selenium UI** (`backend-2026/src/services/selenium/ui.executor.js`) :
  - `POST /ai/decide` (invoqué pas-à-pas pour les actions Chrome/Selenium)
- **Analyse de défaillance** (`backend-2026/src/controllers/ai.controller.js`) :
  - `POST /ai/detect-failure` et `POST /ai/get-fix-suggestion`

### 3. Sécurité et Authentification inter-services
- **Header `X-Internal-Token`** : Transmis par `backend-2026` lors de chaque requête HTTP si la variable d'environnement `FASTAPI_SECRET` est configurée côté Node.
- **Configuration côté `backend-2026`** :
  - `FASTAPI_BASE_URL` (par défaut `http://localhost:8000`)
  - `FASTAPI_SECRET`
  - `FASTAPI_TIMEOUT_MS`, `FASTAPI_GENERATION_TIMEOUT_MS`, `FASTAPI_TRANSLATOR_TIMEOUT_MS`

### 4. Alignement du Modèle de Données & Enums
- **Énumérations QA** : Les constantes métiers définies dans `core/constants.py` (`PRIORITIES`: `low`, `medium`, `high`, `critical` ; `SEVERITIES`: `trivial`, `minor`, `major`, `critical`, `blocker` ; `TEST_CASE_TYPES`: `functional`, `regression`, `e2e`, `api`, `ui`, etc.) sont strictement alignées avec les schémas Mongoose et normaliseurs de `backend-2026` (`utils/test-artifact-fields.js`).
- **Identifiants métier** : Les identifiants `TP-N` (TestPlan) et `TC-N.N` (TestCase) générés par `python-2026` sont enregistrés et indexés de manière unique dans les collections MongoDB de `backend-2026`.

---

## Flux de données principal

```
[Frontend Angular] ──► [backend-2026 (Express :3000)]
                              │
                              ├─ POST /upload-spec (.docx) ──► spec_service ──► docx_reader
                              │                                     └─► ingest_spec()
                              │                                             ├─► chunker (HeadingTree)
                              │                                             ├─► expand_section_to_items()
                              │                                             ├─► tag_role() (Cascade: Regex ➔ Heading ➔ UNTAGGED)
                              │                                             ├─► generate_module_list() (OpenRouter sur CONTEXT+FEATURE+NFR)
                              │                                             ├─► tag_module() (Cosine similarity vs descriptions générées)
                              │                                             └─► _STORE[spec_hash]
                              │
                              ├─ GET /debug/items/{hash} ────► get_items(spec_hash) ──► inspect Items (avec role, method & module)
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
                              ├─ POST /ai/decide (ou runner) ─► ai_decision / selenium_service.run_test()
                              │                                     ├─ [per step] capture_dom_elements()
                              │                                     ├─ POST /ai/decide ──► build_ai_decision_prompt()
                              │                                     │                   └─► AIService.generate_json() ──► OpenRouter HTTP
                              │                                     │                       (+ DOM fallback si LLM échoue)
                              │                                     └─ smart_find() + send_keys() / click()
                              │
                              └─ POST /cancel-generation ─────► cancellation_service.request_cancel()
```

---

## Dépendances Python

```
fastapi
uvicorn[standard]
python-dotenv
python-docx
python-multipart
scipy
sentence-transformers
openai
# requis pour runner & helpers :
selenium
requests
```

---

## Lancement

```bash
# 1. Activer venv
.venv\Scripts\activate

# 2. Installer les dépendances
pip install -r requirements.txt
pip install selenium requests

# 3. Configurer l'environnement (.env)
# OPENROUTER_API_KEY=sk-or-...

# 4. Lancer l'API
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```
