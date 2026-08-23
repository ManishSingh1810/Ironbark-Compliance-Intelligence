# Ironbark Ridge — Compliance Intelligence

Graduate Software Engineer take-home project for **ESGAgent.ai**.

Transform 18 months of messy operational data from a fictional Queensland mining operation into trustworthy emissions reporting, safety intelligence, and data-quality transparency.

## Live demo

| Service | URL |
|---|---|
| **Dashboard** | https://ironbark-compliance-intelligence-4uyswybrd.vercel.app |
| **API** | https://ironbark-compliance-api.onrender.com |

The hosted dashboard reads live data from Neon via the Render API. **Reviewers do not need to rerun ingestion or AI classification** to inspect results. The Render free tier may cold-start (~30–60 s on first request after idle).

**Full submission write-up:** [`WRITEUP.md`](WRITEUP.md)

## Current status

| Checkpoint | Status |
|------------|--------|
| 1 — Data audit | **Complete** |
| 2 — Project init & schema | **Complete** — migration applied to Neon PostgreSQL |
| 3 — Ingestion pipeline | **Complete** — CSV parsing, normalisation, quality issues, rerun detection |
| 4 — Migrations & verify load | **Complete** — real Neon ingestion verified |
| 5 — API endpoints | **Complete** — deterministic Scope 1/2 emissions, incidents, data quality, evidence |
| 6 — AI classification | **Complete** — grounded OpenAI classification, 42/42 under `gpt-4o-mini` + `incident-classification-v3`, manual evaluation in [`docs/AI_EVALUATION.md`](docs/AI_EVALUATION.md) |
| 7 — Vue dashboard | **Complete** — Vue compliance dashboard with charts, AI review queue, data-quality filters and source-evidence drawer |
| 8 — Tests & release readiness | **Complete** — automated test suite, verification scripts, API reliability fix, [`docs/RELEASE_CHECKLIST.md`](docs/RELEASE_CHECKLIST.md) |
| 9 — Deploy & write-up | **Complete** — hosted on Vercel + Render, [`WRITEUP.md`](WRITEUP.md) |

See [`docs/DATA_AUDIT.md`](docs/DATA_AUDIT.md) for the full evidence-based audit of all source files.

## Source data

| File | Rows | Purpose |
|------|------|---------|
| `data/fuel_deliveries.csv` | 150 | Scope 1 fuel activity |
| `data/electricity_meter_readings.csv` | 108 | Scope 2 grid electricity |
| `data/incident_register.csv` | 42 | Safety incidents (AI classification target) |
| `data/suppliers.csv` | 15 | Supplier reference (no Scope 3 factors supplied) |
| `data/emission_factors.csv` | 3 | Authoritative conversion factors — use as-is |

## Stack

- **Backend:** TypeScript, Node.js, Express, PostgreSQL (`pg`), Zod, `csv-parse`
- **Frontend:** Vue 3, Vite, Tailwind CSS, Chart.js
- **Testing:** Vitest, Supertest, Vue Test Utils
- **AI:** OpenAI structured outputs (incident classification only — never emissions math)
- **Deploy:** Neon (DB), Render (API), Vercel (frontend)

## Local setup

```bash
npm install
cp .env.example .env   # set DATABASE_URL; never commit .env
npm run typecheck
```

## Database migration

```bash
npm run migrate
```

The migration runner is rerunnable — migration files already recorded in `schema_migrations` are skipped.

## Ingestion

```bash
npm run ingest
```

**Rerun behaviour:** SHA-256 hashes of source files are compared to the latest **completed** run. Exact match → safe skip. Any change → new run. Parse/insert failure → transaction rollback + separate **failed** run (no partial entity rows).

## Verification

```bash
npm run verify:ingestion
npm run verify:ai
```

Read-only checks against the latest completed run. `verify:ingestion` covers ingestion invariants; `verify:ai` covers complete active-prompt AI analyses. Both exit non-zero on failure. Do not print credentials.

## Frontend dashboard (Checkpoint 7)

```bash
# Terminal 1 — API
npm run dev

# Terminal 2 — Vue dashboard (http://localhost:5173)
npm run dev:web
```

Set `VITE_API_BASE_URL` in `web/.env` (default `http://localhost:3000`). The frontend never receives database credentials or OpenAI keys.

## API

```bash
# Development (tsx, auto-reload not required)
npm run dev

# Production build + start
npm run build
npm run start
```

Set `FRONTEND_URL` (e.g. `http://localhost:5173`) for CORS. In development, if unset, `http://localhost:5173` is allowed. Production should set an explicit origin.

### Latest completed run rule

All `/api/*` metrics endpoints resolve **one** ingestion run:

`ORDER BY completed_at DESC NULLS LAST, started_at DESC` where `status = 'completed'`.

If none exists, endpoints return **503** with a structured error (not empty totals).

### Emissions formulas

Factors come from `emission_factors` for that run (never hard-coded kg values in calculation code).

| Scope | Activity filter | Formula |
|-------|-----------------|---------|
| 1 | `fuel_deliveries.include_in_emissions = true` | `quantity_litres × kg_co2e_per_unit` |
| 2 | `electricity_readings.include_in_emissions = true` | `consumption_kwh × kg_co2e_per_unit` |

Explicit fuel → factor activity mapping (see `api/src/domain/factor-mapping.ts`):

- `Diesel` → `Diesel combustion (stationary & transport)`
- `Petrol (ULP)` → `Petrol (ULP) combustion`
- Electricity → `Grid electricity - Queensland`

Negative fuel credit/reversal quantities are retained and reduce Scope 1. Exact duplicate copies are excluded via `include_in_emissions = false`. Scope 3 is **not** calculated (no suitable supplier factors).

**Units in responses:** activity litres / kWh; `emissionsKgCo2e`; `emissionsTonnesCo2e` (= kg / 1000). Rounding to ≤3 decimals happens only at serialisation.

### Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Liveness (no DB) |
| GET | `/api/emissions/summary` | Scope 1/2 totals + factor metadata |
| GET | `/api/emissions/monthly` | Jan 2025–Jun 2026 monthly series (zero-filled) |
| GET | `/api/incidents/summary` | Counts by severity/type/month + trends |
| GET | `/api/incidents` | Traceable incident rows (`?severity=&type=`) |
| GET | `/api/ai/summary` | Active model/prompt analysis counts |
| GET | `/api/incidents/review` | Incidents with grounded AI findings and review status |
| GET | `/api/data-quality/summary` | Issue counts by action/code/source |
| GET | `/api/data-quality/issues` | Issue rows (`?action=&issueCode=&sourceFilename=&entityTable=`) |
| GET | `/api/evidence/:entityTable/:entityId` | Source record + linked quality issues |

Whitelisted evidence tables: `fuel_deliveries`, `electricity_readings`, `incidents`, `suppliers`, `emission_factors`.

### Example curl

```bash
curl -s http://localhost:3000/health | jq .
curl -s http://localhost:3000/api/emissions/summary | jq .
curl -s http://localhost:3000/api/emissions/monthly | jq '.months[] | select(.month=="2025-11")'
curl -s http://localhost:3000/api/incidents/summary | jq .
curl -s 'http://localhost:3000/api/data-quality/issues?action=flagged' | jq '.count'
```

### Tests

```bash
npm run test      # Vitest + Supertest (no Neon required)
npm run typecheck
npm run build
```

## Documentation

- [`WRITEUP.md`](WRITEUP.md) — submission overview, methodology, and how to run
- [`ASSIGNMENT.md`](ASSIGNMENT.md) — original brief
- [`docs/DATA_AUDIT.md`](docs/DATA_AUDIT.md) — audit decisions
- [`docs/SCHEMA.md`](docs/SCHEMA.md) — schema design notes
- [`docs/AI_EVALUATION.md`](docs/AI_EVALUATION.md) — manual AI evaluation
- [`docs/RELEASE_CHECKLIST.md`](docs/RELEASE_CHECKLIST.md) — Checkpoint 8 release verification
