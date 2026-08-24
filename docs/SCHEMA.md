# PostgreSQL Schema Design

Schema derived from [`DATA_AUDIT.md`](DATA_AUDIT.md). Migration: `api/migrations/001_initial_schema.sql`.

## Design principles

1. **One row per source row** — each activity table stores `*_raw` and normalised columns on the same record.
2. **Full traceability** — every loaded row carries `source_filename`, `source_row`, and `ingestion_run_id`.
3. **Quality actions are separate rows** — `data_quality_issues` logs `fixed`, `flagged`, or `rejected` with original and cleaned values; nothing is silently dropped.
4. **Emissions eligibility is explicit** — `include_in_emissions` on fuel and electricity rows supports duplicate exclusion without deletion.
5. **AI links to internal UUIDs** — `ai_incident_analysis.incident_id` → `incidents.id` (internal UUID), not `source_incident_id`.

## Tables

### `ingestion_runs` / `ingestion_run_files`

| Purpose | Track each pipeline execution and which source files (with SHA-256 hash) it processed |
| Input | Ingestion CLI start/completion |
| Output | Run metadata for rerunnable ingestion and audit |

Rerunnable ingestion compares the complete filename/SHA-256 set against prior **completed** ingestion runs. An exact match skips safely; otherwise a new versioned run is created. Parse/insert failure rolls back and records a separate **failed** run (no partial entity rows).

### `emission_factors`

Reference data from `emission_factors.csv`. Includes `ingestion_run_id`, `source_filename`, and `source_row` like other imported tables. Factors are **versioned per ingestion run**: `UNIQUE (ingestion_run_id, activity)` and `UNIQUE (ingestion_run_id, source_filename, source_row)` — a later run may load a new factor set without conflicting with prior runs. Column `factor_source` avoids clashing with row traceability fields. `scope` is constrained to 1 or 2 only (no Scope 3 factors supplied). `kg_co2e_per_unit` must be non-negative. Used for deterministic Scope 1/2 calculations only.

`source_row` is the 1-based physical CSV line number (header = row 1; first data row = 2).

### `fuel_deliveries`

| Raw fields | Normalised fields |
|------------|-------------------|
| All 7 CSV columns as text | `delivery_date`, `reporting_month`, `date_precision`, `quantity_litres`, `cost_aud`, etc. |

- `date_precision` column uses PostgreSQL enum type `delivery_date_precision` when source date is `Mon-YY`; `delivery_date` stays null.
- `include_in_emissions = false` for exact duplicate copies (`EXACT_DUPLICATE`).
- Negative quantity/cost preserved; flagged via `data_quality_issues` (`CREDIT_REVERSAL`).

### `electricity_readings`

- `period_month` stored as first-of-month `DATE` for consistent monthly aggregation.
- All readings included by default; MTR-07 scale shift flagged in `data_quality_issues`, not excluded.

### `incidents`

| Field | Notes |
|-------|-------|
| `id` | Internal UUID primary key |
| `source_incident_id` | Raw CSV `incident_id` — not unique |
| `severity_raw` | Preserved exactly |
| `severity_normalised` / `severity_label` | Mapped 1–3 for aggregation |

Duplicate source IDs (e.g. INC-2025-011) → two rows, two UUIDs, flagged with `DUPLICATE_SOURCE_IDENTIFIER`.

### `suppliers`

Ingested for data-quality reporting only. No Scope 3 emissions — no spend-to-emissions join.

### `data_quality_issues`

Polymorphic link via `entity_table` + optional `entity_id` so one table serves row-level and file/period-level issues.

| Column | Purpose |
|--------|---------|
| `entity_id` | Nullable — links to a specific imported row when the issue belongs to one record |
| `source_row` | Nullable — physical CSV line when applicable; `NULL` for file-level or period-level findings |
| `action` | `fixed`, `flagged`, or `rejected` (PostgreSQL enum `quality_action`) |
| `issue_code` | Machine-readable code (e.g. `EXACT_DUPLICATE`) |
| `original_value` / `cleaned_value` | Evidence for fixes |
| `explanation` | Human-readable justification |

**File/period-level issues** (no single source row): MTR-06 absence, November 2025 fuel gap, March 2026 site-wide electricity drop. These are flagged at file or reporting-period scope with `source_row = NULL` and optionally `entity_id = NULL`.

### `ai_incident_analysis`

Separate from incidents so AI output never overwrites source data. **`incident_id` is a foreign key to `incidents.id`** (internal UUID). `source_incident_id` is not used here; it remains on the incident row for evidence only.

| Column | Purpose |
|--------|---------|
| `finding_type` | Category, psychosocial, or severity inconsistency |
| `evidence_excerpt` | Quoted text from source description |
| `confidence` | 0–1; nullable when uncertain |
| `requires_human_review` | Default true — never auto-change severity |

`UNIQUE (incident_id, finding_type, model, prompt_version)` prevents duplicate findings when the same model/prompt is re-run against the same incident.

## Environment variables

`api/src/db/client.ts` uses `dotenv` with an explicit path to the repository-root `.env` before reading `process.env`. Node does **not** automatically load a project-root `.env` file — without dotenv, `DATABASE_URL` would be undefined even if `.env` exists. Copy `.env.example` to `.env` at the repo root before running `npm run migrate`.

## Indexes

Partial indexes on `include_in_emissions = true` for fuel/electricity keep monthly emissions queries fast without scanning rejected duplicates.

## Likely interview question

**"Why store raw and normalised values on the same row instead of separate staging tables?"**

**Strong answer:** "Compliance software needs to show both what the client submitted and what we used for calculations. One row per source row keeps joins simple and guarantees we never lose the original evidence. Quality issues are logged separately so we can report every fixed, flagged, and rejected action without duplicating the activity data."
