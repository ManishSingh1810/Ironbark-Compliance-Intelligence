# Ironbark Ridge — Compliance Intelligence

Graduate Software Engineer take-home project for **ESGAgent.ai**.

Transform 18 months of messy operational data from a fictional Queensland mining operation into trustworthy emissions reporting, safety intelligence, and data-quality transparency.

## Current status

| Checkpoint | Status |
|------------|--------|
| 1 — Data audit | **Complete** |
| 2 — Project init & schema | Drafted — **migrate not yet verified** against PostgreSQL |
| 3 — Ingestion pipeline | Not started |
| 4 — Migrations & verify load | Not started |
| 5 — API endpoints | Not started |
| 6 — AI classification | Not started |
| 7 — Vue dashboard | Not started |
| 8 — Tests | Not started |
| 9 — Deploy & write-up | Not started |

See [`docs/DATA_AUDIT.md`](docs/DATA_AUDIT.md) for the full evidence-based audit of all source files.

## Source data

| File | Rows | Purpose |
|------|------|---------|
| `data/fuel_deliveries.csv` | 150 | Scope 1 fuel activity |
| `data/electricity_meter_readings.csv` | 108 | Scope 2 grid electricity |
| `data/incident_register.csv` | 42 | Safety incidents (AI classification target) |
| `data/suppliers.csv` | 15 | Supplier reference (no Scope 3 factors supplied) |
| `data/emission_factors.csv` | 3 | Authoritative conversion factors — use as-is |

## Planned stack

- **Backend:** TypeScript, Node.js, Express, PostgreSQL (`pg`), Zod, `csv-parse`
- **Frontend:** Vue 3, Vite, Tailwind CSS, Chart.js or ECharts
- **Testing:** Vitest, Supertest
- **AI:** OpenAI structured outputs (incident classification only — never emissions math)
- **Deploy:** Neon (DB), Render (API), Vercel (frontend)

## Key audit findings (preview)

- Fuel units mix `L`, `litres`, `Litres`, and `kL` — kL must be × 1,000 before applying factors
- 7 exact duplicate fuel rows (416,265 L at risk of double-counting)
- MTR-07 meter drops ~1000× from Oct 2025 — flag, do not auto-correct
- March 2026: site-wide electricity drop (−64%) correlates with diesel spike (+45%) and substation failure incident
- Incident severity mixes words (`Low`, `Medium`) and numbers (`1`–`3`)
- Psychosocial hazards hidden under `OTH` type code

## Documentation

- [`ASSIGNMENT.md`](ASSIGNMENT.md) — original brief from ESGAgent.ai
- [`docs/DATA_AUDIT.md`](docs/DATA_AUDIT.md) — detailed data audit with fixed/flagged/rejected decisions
- [`docs/SCHEMA.md`](docs/SCHEMA.md) — PostgreSQL schema design notes

## Local setup (Checkpoint 2)

```bash
# Install dependencies
npm install

# Copy environment template and set DATABASE_URL
cp .env.example .env

# Type-check the API package
npm run typecheck

# Apply migrations (requires running PostgreSQL — schema is not validated until this succeeds)
npm run migrate
```

Setup and run instructions for ingestion, API, and frontend will expand in later checkpoints.
