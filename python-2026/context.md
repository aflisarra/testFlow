# context.md — python-2026 : état du projet

> Mis à jour le 2026-08-12.

---

## Vue d'ensemble

**python-2026** est un backend **FastAPI** (Python) qui sert de microservice d'IA et d'automatisations NLP/Selenium pour l'API principale **`backend-2026`** (Express.js / Node.js). Il expose une API REST pour :

1. **Ingestion & Itemisation structurée (Phases 1-4c)** : Chunking récursif sensible aux titres `.docx`, extraction atomique d'items (puces / phrases), classification déterministe en cascade des rôles (`tag_role`) et persistance avec `module_status=pending`. L'upload n'appelle ni OpenRouter ni le modèle d'embedding.
2. **File de revue humaine (Phase 5a)** : Exposition d'endpoints `/review-queue/{spec_hash}` permettant d'inspecter et de valider manuellement les items non classés (`UNTAGGED` -> `role_method="human"`).
3. **Génération de Test Plans (Phase 5b)** : `POST /generate-plan` assure une version courante des cartes modules (un appel LLM sur cache miss/régénération), tague les items, persiste les affectations puis assemble les plans de façon déterministe.
4. **Génération ciblé de Test Cases par module (Phase 6)** : Conditionnement du prompt LLM avec filtrage contextuel strict des items par rôle autorisés (`TASK_MANIFEST`) et par module (`get_filtered_items_for_task`).
5. **Décisions AI step-by-step** pour l'automatisation UI (Selenium + DOM fallback).
6. **Exécution et annulation** des tests Selenium et requêtes en cours.

Le LLM principal utilisé est **OpenRouter** (ex. `google/gemini-2.5-flash`), appelé via HTTP.
Pour l'embedding et l'alignement sémantique des modules, le système s'appuie sur `sentence-transformers` (`paraphrase-multilingual-MiniLM-L12-v2`) et `scipy` pour l'alignement de Hungarian contre le registre Gold.

---

## Structure du projet

```
python-2026/
├── main.py                        # Point d'entrée FastAPI (v2.0.0, inclut le routeur review)
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
│   ├── review.py                  # GET /review-queue/{spec_hash}, POST /review-queue/{spec_hash}/{item_id} (Phase 5a)
│   ├── ai_decision.py             # POST /ai/decide (décision AI step-by-step)
│   ├── ai_fix.py                  # POST /ai/detect-failure, POST /ai/get-fix-suggestion
│   ├── test_runner.py             # POST /test-runner/run (exécution Selenium)
│   └── cancellation.py            # POST /cancel-generation
├── services/
│   ├── ai_service.py              # AiService (generate_json + repair JSON via OpenRouter)
│   ├── plan_service.py            # generate_test_plans() (Phase 5b déterministe)
│   ├── case_service.py            # generate_test_cases() (Phase 6 filtrage contextuel par module)
│   ├── spec_service.py            # extract_spec_text, chunk_docx_bytes, filter_srs_sections, extract_requirements
│   ├── cancellation_service.py    # request_cancel(), is_cancelled() (TTL-based, thread-safe)
│   ├── ingestion/                 # Pipeline d'ingestion (Phases 1-7 complets)
│   │   ├── __init__.py
│   │   ├── items.py               # Modèle Item, expand_section_to_items(), derive requirement_id
│   │   ├── role_rules.py          # Règles lexicales / regex déterministes par rôle (Phase 3/7)
│   │   ├── role_heading_prior.py   # Détection par mots-clés sur le titre parent direct (Phase 3/7)
│   │   ├── tagger.py              # Classifier de rôles tag_role() (regex -> heading -> UNTAGGED, sans fallback embedding)
│   │   ├── module_generation.py   # Extraits de preuve & appel LLM pour générer les cartes modules spec-local
│   │   ├── module_orchestration.py # Ensure/regenerate, version, tagging, couverture et commit atomique
│   │   ├── module_tagger.py       # Alignement et tagging des items sur les modules générés (tag_module)
│   │   ├── module_gold.py         # Registre Gold pour l'alignement de Hungarian (SonicWave)
│   │   ├── module_validation.py   # Comparaison legacy vs généré & scoring Hungarian
│   │   ├── manifest.py            # TASK_MANIFEST contract & get_filtered_items_for_task (Phase 4b/6)
│   │   ├── store_client.py        # Client HTTP d'ingestion inter-services vers Node/MongoDB (Phase 4c)
│   │   ├── review_queue.py        # Logique de gestion et résolution de la file d'attente de revue (Phase 5a)
│   │   └── ingest.py              # Pipeline d'ingestion complet ingest_spec() (ingest -> tag -> store)
│   ├── ai/
│   │   └── ai_service.py          # AIService secondaire (OpenRouter HTTP)
│   └── selenium/
│       └── selenium_service.py    # run_test() — orchestration Selenium + appels /ai/decide
├── schemas/
│   ├── test_plan_schema.py        # GeneratePlanRequest, GeneratePlanResponse (avec pending_review_count)
│   └── test_case_schema.py        # GenerateTestCasesRequest, TestCasesResponse (avec pending_review_count & plan_module)
├── prompts/
│   ├── test_plan_prompt.py        # build_test_plan_prompt() (conservé comme secours)
│   ├── test_case_prompt.py        # build_test_case_prompt() (reçoit filtered_items par module)
│   ├── ai_decision_prompt.py      # build_ai_decision_prompt()
│   └── validate.prompt.py         # (mini prompt de validation)
├── utils/
│   ├── openrouter.py              # run_openrouter() : HTTP, timeout-safe
│   ├── json_cleaner.py            # safe_json_loads() : robuste aux sorties LLM
│   ├── chunker.py                 # chunk_spec_recursive(), build_heading_tree(), _heading_level_of(), split_by_headings()
│   ├── docx_reader.py             # extract_text_from_docx(), extract_doc_from_bytes()
│   └── logger.py                  # get_logger(), log_event(), log_error() (JSON structuré)
├── tests/                         # Suite complète de tests unitaires
│   ├── test_chunker.py            # Tests du chunking récursif (Phase 1)
│   ├── test_role_tagger.py        # Tests du classifier de rôles déterministe (Phase 3/7)
│   ├── test_module_generation.py  # Tests de génération et tagging des modules (Phase 4)
│   ├── test_manifest.py           # Tests du filtrage par tâche et module (Phase 4b/6)
│   ├── test_store_client.py       # Tests du client HTTP inter-services (Phase 4c)
│   ├── test_review_queue.py       # Tests de la file de revue humaine (Phase 5a)
│   ├── test_deterministic_plans.py # Tests de la génération déterministe de plans (Phase 5b)
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
| `POST` | `/upload-spec` | Upload `.docx` → extrait, itemise et tague les rôles, puis persiste avec les modules en attente (aucun appel LLM/embedding) |
| `GET` | `/debug/items/{spec_hash}` | Inspecte le store d'items (count + sample structuré) pour un hash donné |
| `GET` | `/review-queue/{spec_hash}` | Liste les items `UNTAGGED` en attente de revue humaine (Phase 5a) |
| `POST` | `/review-queue/{spec_hash}/{item_id}` | Valide le rôle d'un item par un humain (`role_method="human"`, `reviewed=True`) |
| `POST` | `/generate-plan` | Assure/génère les modules, tague et persiste les affectations, puis assemble les Test Plans déterministes (TP-1..TP-N) |
| `POST` | `/generate-test-cases` | Génère les Test Cases d'un plan conditionné par le module et le filtrage `TASK_MANIFEST` (Phase 6) |
| `POST` | `/ai/decide` | Décision AI pour une step UI (step + DOM → actions) |
| `POST` | `/ai/detect-failure` | Analyse d'échec de test Selenium |
| `POST` | `/ai/get-fix-suggestion` | Suggestion de correctif pour test Selenium |
| `POST` | `/test-runner/run` | Exécute un test case via Selenium |
| `POST` | `/cancel-generation` | Annule une génération en cours |
| `POST` | `/chat` | Chat libre avec OpenRouter |

---

## Ce qui est implémenté et fonctionnel (Plan d'implémentation 100% complété)

### 1. Chunking récursif sensible aux titres (`utils/chunker.py`) — Phase 1
- **Arbre de titres (`HeadingNode`)** : parcours unique de l'arbre documentaire. Les paragraphes d'introduction situés entre un titre parent et son premier sous-titre sont attribués au parent via `own_paragraphs`.
- **Support bilingue & outline XML** : détection des styles `Heading 1..6` (Anglais), `Titre 1..6` (Français) et fallback sur l'attribut XML `<w:outlineLvl>`.
- **Propagation d'ancêtres (`heading_path`)** : chaque chunk conserve le chemin complet des titres ancêtres (ex: `["2. Fonctionnalités", "2.1 Authentification"]`).

### 2. Ingestion & Itemisation atomique (`services/ingestion/items.py`) — Phase 2
- **Modèle `Item`** (`id`, `source_chunk_id`, `heading_path`, `text`, `role`, `role_method`, `module`, `role_score`, `module_score`, `reviewed`, `reviewed_by`, `suggested_role`, `requirement_id`).
- **Stratégie de découpage 2-pass (`expand_section_to_items`)** : extraction des puces (`-`, `*`, `•`, `1.`) puis découpage des phrases aux limites (`. `, `! `, `? `).
- **Dérivation de `requirement_id`** : attribution automatique de `REQ-XXXXX` pour les items identifiés comme exigences.

### 3. Classifier de Rôles en cascade déterministe (`services/ingestion/tagger.py`, `role_rules.py`) — Phases 3 & 7
- **Cascade à 2 niveaux (sans fallback embedding / LLM)** :
  1. **Regex déterministe (`role_rules.py`)** : détection des exigences modales (`shall`, `must`, `devra`), critères UC/BDD (`given`, `when`, `then`), contraintes NFR, acteurs et termes de glossaire.
  2. **Prior du titre parent (`role_heading_prior.py`)** : détection par mots-clés sur le titre parent immédiat (`utilisateur`, `glossaire`, `contexte`).
  3. **Défaut** : `UNTAGGED` (`method="none"`).
- Tout item non classé conserve `role="UNTAGGED"` et entre dans la file de revue humaine (Phase 5a).

### 4. Génération & Classification des Modules par Spec (`services/ingestion/module_*`) — Phase 4
- **Propriété de `/generate-plan` (`module_orchestration.py`)** : génération/reuse versionnée avec lease, empreinte des preuves, couverture et persistance des champs modules uniquement.
- **Extraction générative des modules (`module_generation.py`)** : sélection d'items de preuve de haute confiance (`CONTEXT`, `FEATURE`, `REQUIREMENT`, `ACCEPTANCE`, `NON_FUNCTIONAL` avec `role_method != 'none'`) transmis à OpenRouter pour générer 1 à 12 cartes modules spec-local `{id, name, description, kind}`.
- **Tagging des items par module (`module_tagger.py`)** : comparaison vectorielle enrichie par titres et sources citées; les rôles `GLOSSARY`, `OUT_OF_SCOPE` et `UNTAGGED` sont explicitement exclus.
- **Validation Gold & Hungarian Alignment (`module_validation.py`, `module_gold.py`)** : évaluation automatisée contre le jeu de référence SonicWave (score > 0.60).

### 5. Identité, Manifeste et propagation `spec_hash` (`services/ingestion/manifest.py`) — Phase 4b
- **`TASK_MANIFEST`** : contrat strict définissant les rôles autorisés par tâche (ex. `generate-test-cases` accepte `FEATURE`, `REQUIREMENT`, `ACCEPTANCE`).
- **Isolation des items `UNTAGGED`** : les items non révisés/non classés sont exclus des prompts et comptabilisés dans `pending_review_count`.

### 6. Persistance résiliente Node / MongoDB (`services/ingestion/store_client.py`) — Phase 4c
- **Intégration inter-services** : remplacement des dictionnaires en mémoire par un client HTTP FastAPI (`store_client.py`) communiquant avec l'API interne `backend-2026` (`/api/internal/spec-ingestions`).
- Persistance et survie aux redémarrages des snapshots d'ingestion (`SpecIngestion`) et des items (`SpecIngestionItem`). Securisation via header HTTP `X-Internal-Token`.

### 7. File d'attente de revue humaine (`services/ingestion/review_queue.py`, `routers/review.py`) — Phase 5a
- **Endpoints de revue** : `GET /review-queue/{spec_hash}` pour lister les items en attente et `POST /review-queue/{spec_hash}/{item_id}` pour enregistrer la décision d'un réviseur.
- La résolution humaine passe `role_method="human"`, `reviewed=True` et génère un `requirement_id` si le rôle choisi est `REQUIREMENT`.

### 8. Génération déterministe des Test Plans (`services/plan_service.py`) — Phase 5b
- **Assemblage déterministe après module ensure** : une fois le snapshot module prêt, les objets `TP-N` sont assemblés sans second appel LLM.
- Un module est éligible avec au moins une preuve `REQUIREMENT`, `ACCEPTANCE` ou `NON_FUNCTIONAL`; les NFR transverses produisent un plan qualité.
- Le mode `ensure` réutilise le snapshot courant; le mode `regenerate` produit une nouvelle version.

### 9. Scope et filtrage contextuel des Test Cases (`services/case_service.py`) — Phase 6
- **Filtrage par module & rôle** : conditionnement des prompts avec les items `FEATURE`, `REQUIREMENT`, `ACCEPTANCE` et `NON_FUNCTIONAL`, de préférence liés par `plan_module_id` stable.
- Propagation continue du `pending_review_count` vers l'utilisateur.

---

## Ce qui est manquant / TODO (Industrialisation & Production)

- **CORS restreint en production** : restreindre `allow_origins=["*"]` dans `main.py` à l'URL du backend/frontend prod.
- **Outillage Qualité** : intégration d'un `pyproject.toml` avec `ruff` / `black` pour le formatage automatique du code Python.

---

## Intégration et contrat avec `backend-2026`

`python-2026` fonctionne comme un microservice AI/NLP pour l'API principale **`backend-2026`** (Express 5 / Node.js sur le port 3000).

### 1. Persistance MongoDB déléguée (Phase 4c)
- `python-2026` ne possède pas de base de données directe. Il délègue la persistance à `backend-2026` via les routes internes `/api/internal/spec-ingestions` protégées par `X-Internal-Token`.
- Les collections Mongoose `SpecIngestion` et `SpecIngestionItem` dans `backend-2026` garantissent la durabilité des items, des cartes modules et des résolutions humaines.

### 2. Endpoints sollicités par `backend-2026`
- `POST /upload-spec` : Ingestion, découpage et persistance MongoDB.
- `GET /review-queue/{spec_hash}` & `POST /review-queue/{spec_hash}/{item_id}` : Gestion de la revue humaine.
- `POST /generate-plan` : Assemblage déterministe des plans de test.
- `POST /generate-test-cases` : Génération ciblée par module des cas de test.
- `POST /ai/decide`, `/ai/detect-failure`, `/ai/get-fix-suggestion` : Décisions Selenium et analyse d'erreurs.
- `POST /cancel-generation` : Annulation de tâches.

### 3. Sécurité et Authentification inter-services
- **Header `X-Internal-Token`** : Transmis par `backend-2026` et vérifié de manière constante via comparaison en temps constant (`crypto.timingSafeEqual`).

---

## Flux de données principal

```
[Frontend Angular] ──► [backend-2026 (Express :3000)]
                              │
                              ├─ POST /upload-spec (.docx) ──► spec_service ──► ingest_spec()
                              │                                     ├─► chunker (HeadingTree)
                              │                                     ├─► expand_section_to_items()
                              │                                     ├─► tag_role() (Cascade déterministe)
                              │                                     └─► store_client.py ──► PUT items + module_status=pending
                              │
                              ├─ GET /review-queue/{hash} ────► store_client.py ──► GET /api/internal/spec-ingestions/:hash/review-queue
                              ├─ POST /review-queue/... ──────► store_client.py ──► PATCH /api/internal/.../items/:id/review
                              │
                              ├─ POST /generate-plan ─────────► plan_service.generate_test_plans()
                              │                                     ├─► ensure_modules_for_plan() (generate/reuse + tag + commit)
                              │                                     └─► build_test_plans_deterministic() (REQUIREMENT/ACCEPTANCE/NFR)
                              │
                              ├─ POST /generate-test-cases ───► case_service.generate_test_cases()
                              │                                     ├─► get_filtered_items_for_task(spec_hash, task, module)
                              │                                     ├─► build_test_case_prompt(filtered_items)
                              │                                     └─► AiService.generate_json() ──► OpenRouter HTTP
                              │
                              └─ POST /ai/decide (Selenium) ─► ai_decision / selenium_service.run_test()
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
# FASTAPI_SECRET=your-internal-secret

# 4. Lancer l'API
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```
