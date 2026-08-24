# Ironbark Ridge — Compliance Intelligence

**Graduate Software Engineer take-home · ESGAgent.ai**

## 1. Overview

This application turns 18 months of messy operational CSVs from a fictional Queensland mining site into **deterministic Scope 1/2 emissions reporting**, **traceable data-quality transparency**, and **AI-assisted safety review** for 42 incidents. Emissions are calculated in code from supplied factors only; OpenAI is used **only** for incident classification and never for emissions math.

**Architecture (summary):**

| Layer | Technology |
|---|---|
| Database | PostgreSQL (Neon) |
| Backend | Node.js, Express, TypeScript |
| Frontend | Vue 3, Vite, Tailwind CSS, Chart.js |
| AI | OpenAI structured outputs (`gpt-4o-mini`, prompt `incident-classification-v3`) |

**Hosted deployment (reviewers can inspect without running locally):**

- **Dashboard:** https://ironbark-compliance-intelligence-4uyswybrd.vercel.app
- **API health:** https://ironbark-compliance-api.onrender.com/health

> **Note:** The Render free tier may cold-start (first request can take ~30–60 seconds). Refresh if the dashboard shows a loading or connection delay.

---

## 2. How to run everything

### Prerequisites

- **Node.js 20+**
- **PostgreSQL** (Neon recommended) with `DATABASE_URL`
- **OpenAI API key** (only required for classification, not for viewing hosted results)

### Setup

```bash
git clone <repository-url> ironbark-compliance-intelligence
cd ironbark-compliance-intelligence
npm ci                        # reproducible install from lockfile
cp .env.example .env          # then edit .env — never commit this file
```

**`.env` variables (placeholders only — use your own values):**

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `PGSSLMODE` | `require` for Neon; `disable` for local Postgres without SSL |
| `PORT` | API port (default 3000) |
| `FRONTEND_URL` | CORS origin for production (e.g. Vercel URL) |
| `OPENAI_API_KEY` | OpenAI key for classification CLI |
| `OPENAI_MODEL` | Must be `gpt-4o-mini` to match stored findings |

**Frontend (`web/.env` or build env on Vercel):**

| Variable | Purpose |
|---|---|
| `VITE_API_BASE_URL` | Public API URL (e.g. `http://localhost:3000` locally) |

### Database migration

```bash
npm run migrate
```

Rerunnable — already-applied migrations in `schema_migrations` are skipped.

### Ingestion

```bash
npm run ingest
```

Compares the complete filename/SHA-256 set against prior completed ingestion runs. An exact match skips safely; otherwise a new versioned run is created.

### AI classification

```bash
npm run ai:classify
```

Classifies incidents from the latest completed ingestion run. Skips incidents that already have complete analyses for the active `(model, prompt_version)`.

**Reviewers inspecting the hosted dashboard do not need to rerun classification** — 42/42 v3 analyses are already stored in Neon.

### API

```bash
npm run dev          # development (tsx)
npm run build && npm run start   # production
```

### Frontend

```bash
npm run dev:web      # http://localhost:5173
```

### Verification

```bash
npm run verify:ingestion   # row counts, quality issues, traceability
npm run verify:ai          # 42/42 complete, grounding, prompt version
npm run typecheck
npm run test
npm run build
```

---

## 3. Architecture and data flow

```
CSV files (data/)
    ↓  parse, normalise, quality issues
PostgreSQL (Neon)
    ↓  latest completed ingestion run
Express API (/api/*)
    ↓  JSON over HTTPS
Vue dashboard (Vercel)
```

**Incidents (AI path):**

```
incident descriptions (PostgreSQL)
    ↓  offline batch CLI (npm run ai:classify)
OpenAI structured output
    ↓  substring grounding validation
ai_incident_analysis (PostgreSQL)
    ↓  filtered by active model + prompt version
API + dashboard review queue
```

The **frontend never connects to PostgreSQL or OpenAI**. It only calls the Express API. Database credentials and API keys exist only on the server.

---

## 4. Data problems and decisions

Every decision is logged in `data_quality_issues` with source filename, source row, action, and explanation. Three actions:

| Action | Meaning |
|---|---|
| **fixed** | Value corrected during ingestion; original retained in issue log |
| **flagged** | Row kept; caveat surfaced to reviewers |
| **rejected** | Row preserved in database but excluded from emissions calculations |

**Verified issues and decisions:**

| Issue | Decision |
|---|---|
| Whitespace in CSV headers (` Delivery Date`, ` Unit`) | **Fixed** — trimmed; logged as `HEADER_OR_VALUE_TRIM` |
| Mixed volume units (`L`, `litres`, `Litres`, `kL`) | **Fixed** — normalised to litres; `kL × 1000` |
| Mixed dates including `Mon-YY` | **Flagged** — `reporting_month` stored; `delivery_date` null; `MONTH_ONLY_DATE` |
| Seven exact fuel duplicate rows | **Rejected** from emissions — canonical copy included; duplicate copy preserved with `EXACT_DUPLICATE` |
| Negative credit/reversal (INV-41777) | **Retained** in Scope 1; **flagged** `CREDIT_REVERSAL` |
| Large deliveries (>100,000 L) | **Retained**; **flagged** `LARGE_DELIVERY` |
| November 2025 fuel gap | **Not imputed** — zero Scope 1 for that month is honest |
| Missing meter MTR-06 | **Flagged** `MISSING_METER` (file/period level) |
| MTR-07 Oct 2025 scale shift (~1000× drop) | **Included unchanged** in Scope 2; **flagged** `MTR07_SCALE_SHIFT` — Scope 2 may be **understated** |
| March 2026 site-wide electricity drop | **Flagged** `SITE_ELECTRICITY_DROP` |
| Duplicate source incident ID (INC-2025-011) | **Both retained** — distinct internal UUIDs |
| Mixed severity values (`1`, `Low`, `Medium`) | **Normalised** to labels 1–3; raw values retained |
| Supplier invalid/missing ABN, duplicate entities | **Flagged** — reference data only |
| Scope 3 | **Not calculated** — no appropriate supplier/spend factor supplied |

Full audit evidence: [`docs/DATA_AUDIT.md`](docs/DATA_AUDIT.md).

---

## 5. Emissions methodology

- Factors taken **only** from `data/emission_factors.csv` (never invented or LLM-derived).
- **Scope 1:** included fuel `quantity_litres ×` matching factor (Diesel → 2.70 kg CO₂e/L; Petrol ULP → 2.31 kg CO₂e/L).
- **Scope 2:** included grid electricity `consumption_kwh ×` Queensland grid factor (0.71 kg CO₂e/kWh).
- Exact duplicate fuel copies **excluded** (`include_in_emissions = false`).
- Negative credit quantities **retained** (reduce Scope 1).
- **No LLM** used anywhere in emissions calculations.

**Verified totals (latest completed ingestion run):**

| Scope | Emissions |
|---|---|
| Scope 1 | **22,052,474.310 kg CO₂e** (22,052.5 t CO₂e) |
| Scope 2 | **23,333,236.088 kg CO₂e** (23,333.2 t CO₂e) |
| Combined | **45,385,710.398 kg CO₂e** (45,385.7 t CO₂e) |

API returns kg and tonnes; dashboard displays tonnes to one decimal.

---

## 6. Additional insight not explicitly requested

**March 2026 cross-dataset relationship (correlation, not proven causation):**

From Feb → Mar 2026 monthly emissions:

- **Scope 2 (grid proxy): −63.7%** (1,229.1 → 446.7 t CO₂e)
- **Scope 1 (fuel proxy): +44.4%** (1,311.8 → 1,893.9 t CO₂e)

Coincident incidents in the same period:

- **INC-2026-131** — regional substation failure causing loss of grid supply (backup generators likely increased diesel use).
- **INC-2026-134** — multiple crews reporting fatigue after extended shifts during the outage.

The aligned timing suggests backup-generator operation may explain the activity shift, but the data **does not prove causation**. The dashboard presents this as a standout insight with explicit caveats.

---

## 7. AI layer and grounding

| Setting | Value |
|---|---|
| Model | `gpt-4o-mini` |
| Active prompt | `incident-classification-v3` |
| Analysed | **42/42** incidents |
| Finding rows | **126** (3 per incident) |
| Psychosocial **yes** | **3** |
| Severity possibly inconsistent | **7** |
| Human review | **All findings** (`requires_human_review = true`) |

**Grounding:** every stored `evidence_excerpt` must be an exact substring of the source incident description. Fail-closed validation rejects invented text. For `"no"` / `"consistent"` assessments, nullable excerpts store deterministic source context — not proof the negative judgment is correct.

**Traceability:** each finding links to internal UUID, `source_incident_id`, `source_filename`, and `source_row`. Findings are versioned by `(model, prompt_version)` and **do not overwrite** recorded severity in the incident register.

**Immutable prompts:** v1/v2/v3 prompt files are not edited in place after stored findings exist. Prompt changes create new versions.

Manual evaluation: [`docs/AI_EVALUATION.md`](docs/AI_EVALUATION.md).

---

## 8. How AI coding tools were used

**Honest account:**

- **ChatGPT** — planning, architecture review, validation questions, checkpoint review, debugging, and interview-focused explanations.
- **Cursor** — generated and edited code under structured checkpoint prompts.

Every checkpoint was reviewed with typechecks, tests, real Neon/API verification, and manual dashboard inspection. AI tools did **not** make autonomous compliance decisions or replace deterministic calculations.

**Concrete mistakes caught during review:**

| Mistake | How caught |
|---|---|
| v1 invented negative psychosocial evidence | Substring grounding validation |
| v2 invented severity-consistency evidence | Grounding checks |
| Attempted in-place v2 prompt edit | Restored immutable v2; introduced v3 |
| Review-priority vocabulary mismatch | Unit tests + manual review |
| `OPENAI_MODEL` truncated to `gpt-4o-` | curl/API showed 0/42; config mismatch identified |
| Scope 2 total transcription typo in docs | Arithmetic check against source API |

I used AI-assisted code generation extensively, then reviewed, tested, corrected, and took responsibility for the submitted implementation. I can explain and modify its important execution paths.

---

## 9. What AI got wrong in the data

Grounding proves **evidence provenance**, not **judgment correctness**.

| Incident | Issue |
|---|---|
| **INC-2026-134** | Grounded excerpt for fatigue/extended shifts, but classified psychosocial **no** — likely **false negative** |
| **INC-2026-029** | Routine speed exceedance flagged severity possibly inconsistent — likely **false positive** |
| **INC-2026-021** | Same haul-truck narrative as INC-2025-008 coded Medium vs High — **cross-record severity blind spot**; single-incident model marked both consistent |

Stored AI rows were not modified to match human judgment.

---

## 10. Testing strategy

Tests prioritise behaviours that would cause **incorrect compliance results** or **misleading reviewer experience**:

| Area | Examples |
|---|---|
| Unit conversion | kL × 1000, currency stripping, severity normalisation |
| Duplicates | Exact fuel duplicates excluded from emissions |
| Emissions | Factor mapping, integrity errors for unknown fuel |
| Source traceability | filename/row on every entity |
| AI schemas & grounding | Substring validation, nullable excerpt rules |
| API | Structured 400/404/500, no secret leakage |
| AI reruns | Prompt version immutability, skip-on-complete |
| Frontend | Honest AI empty/error states, evidence drawer fields |

**Current counts:** API **87** tests · frontend **18** tests · **105 total**.

```bash
npm run test
```

---

## 11. What I would build with another week

Prioritised, realistic extensions:

1. **Human-review workflow** — reviewer decisions, notes, and audit history per finding
2. **Cross-record anomaly detection** — severity consistency across similar incidents (e.g. INC-2026-021 / INC-2025-008)
3. **Configurable factor mappings and reporting periods** — admin UI instead of code-only mapping
4. **Background job/queue for AI classification** — replace synchronous CLI batch
5. **Database retry/observability** — structured logging, connection health metrics
6. **Browser E2E + CI** — Playwright against hosted URLs on every push
7. **Downloadable compliance report** — PDF/CSV with source citations

Authentication and enterprise security are **not** implemented in this submission.

---

## 12. Known limitations

- Fictional site with simplified emission factors
- **No Scope 3** (no suitable supplier factors supplied)
- All AI findings require **human review** — not compliance determinations
- **MTR-07 scale shift** — Scope 2 may be understated; flagged but not corrected
- **Render free tier** — cold starts and occasional transient routing delays
- **No browser E2E** tests (unit/integration only)
- **No user authentication**
- March 2026 insight is **correlation only**, not proven causation

---

## Further documentation

| Document | Purpose |
|---|---|
| [`README.md`](README.md) | Quick reference and commands |
| [`docs/DATA_AUDIT.md`](docs/DATA_AUDIT.md) | Evidence-based CSV audit |
| [`docs/AI_EVALUATION.md`](docs/AI_EVALUATION.md) | Manual AI evaluation |
| [`docs/RELEASE_CHECKLIST.md`](docs/RELEASE_CHECKLIST.md) | Checkpoint 8 verification |
| [`docs/SCHEMA.md`](docs/SCHEMA.md) | Database design notes |
