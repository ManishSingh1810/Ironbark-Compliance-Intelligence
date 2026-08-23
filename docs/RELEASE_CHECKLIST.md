# Release readiness checklist

Checkpoint 8 verification against the Ironbark Compliance Intelligence assignment.  
Verified on **2026-08-24** against Neon ingestion run `c269bb06-65c6-450f-b23f-ef066c7b2771`.

| Assignment requirement | Implementation | Verification | Status | Remaining limitation |
|---|---|---|---|---|
| Evidence-based CSV audit | [`docs/DATA_AUDIT.md`](DATA_AUDIT.md) | Manual review of all 5 source files | **Pass** | Audit is point-in-time; source CSVs are read-only |
| Relational PostgreSQL schema | [`api/migrations/001_initial_schema.sql`](../api/migrations/001_initial_schema.sql), [`docs/SCHEMA.md`](SCHEMA.md) | `npm run migrate` skips already-applied migration | **Pass** | Single migration file; no down migrations |
| Traceable CSV ingestion | [`api/src/ingestion/`](../api/src/ingestion/) | `npm run ingest` skips unchanged hashes; `npm run verify:ingestion` | **Pass** | Failed runs roll back; re-ingest required after CSV edits |
| Verified Neon load | [`api/src/ingestion/verify-ingestion.ts`](../api/src/ingestion/verify-ingestion.ts) | 150 fuel, 108 electricity, 42 incidents, 15 suppliers, 3 factors, **71** quality issues | **Pass** | Requires live `DATABASE_URL` |
| Deterministic Scope 1/2 emissions API | [`api/src/services/emissions-calc.ts`](../api/src/services/emissions-calc.ts), `/api/emissions/*` | API smoke: Scope 1 **22,052,474.310 kg**, Scope 2 **23,333,236.088 kg**, Combined **45,385,710.398 kg** | **Pass** | Scope 3 not calculated; exact duplicates excluded from Scope 1 |
| Incident summary API | `/api/incidents/summary`, `/api/incidents` | API smoke: **42** incidents; Supertest route tests | **Pass** | Duplicate source IDs preserved as separate UUIDs |
| Data-quality transparency | `/api/data-quality/summary`, `/api/data-quality/issues` | API smoke: **71** issues; filters return structured **400** on invalid params | **Pass** | Issue list paginated in UI (show more) |
| Source evidence API | `/api/evidence/:entityTable/:entityId` | Valid UUID **200**; invalid UUID **400** `INVALID_QUERY`; missing row **404** | **Pass** | Whitelisted entity tables only |
| Grounded OpenAI classification | [`api/src/ai/`](../api/src/ai/), prompt `incident-classification-v3` | `npm run verify:ai`: **42/42** complete, **126** finding rows, all excerpts grounded | **Pass** | All findings require human review; model cost/latency not optimised |
| Psychosocial hazard detection | AI finding type `psychosocial_hazard` | API smoke + verify:ai: **3** `yes` assessments | **Pass** | AI-assisted only; not a compliance determination |
| Severity inconsistency review | AI finding type `severity_inconsistency` | API smoke + verify:ai: **7** `possibly_inconsistent` | **Pass** | Heuristic review flag, not automatic severity correction |
| AI review queue (unique incidents) | [`web/src/utils/aiDisplay.ts`](../web/src/utils/aiDisplay.ts), dashboard KPI | API-derived unique count **7**; frontend regression tests | **Pass** | Queue shows Pending/Unavailable when model mismatch or API failure |
| Vue compliance dashboard | [`web/src/`](../web/src/) | `npm run dev:web`; unit tests (18); manual smoke at `http://localhost:5173` | **Pass** | No browser E2E suite; Chart.js warnings in jsdom only |
| Charts and March insight | `EmissionsChart.vue`, `MarchInsight.vue` | Renders with live monthly API data; `marchInsight.test.ts` | **Pass** | March insight is correlational, not causal proof |
| Evidence drawer | `EvidenceDrawer.vue` | Shows all three AI finding groups; Escape/focus tests | **Pass** | Requires API for stored record fetch |
| Data-quality filters | `DataQualityPanel.vue` | App test: action/code filters + show more | **Pass** | Client-side filter on loaded issue batch |
| Honest error states | `useDashboardData.ts`, `ErrorBanner.vue`, `aiDisplay.ts` | App tests for AI failure and model mismatch | **Pass** | No offline/retry queue |
| Automated tests | Vitest (API + web) | `npm run test`: **API 87**, **web 18** | **Pass** | No Playwright/Cypress E2E |
| Type safety / production build | `tsc`, `vue-tsc`, Vite | `npm run typecheck`, `npm run build` | **Pass** | API starts from `dist/` via `npm run start` |
| Secrets excluded from Git | [`.gitignore`](../.gitignore), `.env.example` files | `.env` ignored; secret scan: only placeholder URLs in tracked files; no `.zip` committed | **Pass** | Local `.env` must never be committed |
| API reliability (DB idle errors) | [`api/src/db/client.ts`](../api/src/db/client.ts) | Pool `error` listener added; route test: query failure → **500**, `/health` still **200** | **Pass** | Transient Neon timeouts may still fail individual requests until client retry |
| Structured HTTP errors | [`api/src/middleware/error-handler.ts`](../api/src/middleware/error-handler.ts) | Smoke: **400** invalid query, **404** unknown route, **500** internal | **Pass** | No request ID / correlation logging |
| Documentation | README, DATA_AUDIT, SCHEMA, AI_EVALUATION | README checkpoint table; this checklist | **Pass** | `WRITEUP.md` and live deploy pending (Checkpoint 9) |
| Deployment readiness | Render (API), Vercel (frontend), Neon (DB) per README stack | Build succeeds; env vars documented in `.env.example` | **Pending** | No production URLs, CI, or hosted deploy yet |

## Release verification commands

```bash
npm ci
npm run typecheck
npm run test
npm run build
npm run migrate
npm run ingest
npm run verify:ingestion
npm run verify:ai
git diff --check
```

## Production environment variables

| Variable | Service | Required |
|---|---|---|
| `DATABASE_URL` | API | Yes |
| `PGSSLMODE` | API | Yes (not `disable` on Neon) |
| `OPENAI_API_KEY` | API | Yes for classification endpoints |
| `OPENAI_MODEL` | API | Yes — must match stored findings (`gpt-4o-mini`) |
| `FRONTEND_URL` | API | Yes in production (CORS) |
| `PORT` | API | Optional (default 3000) |
| `VITE_API_BASE_URL` | Web build | Yes — public API URL baked at build time |

## Deployment blockers (Checkpoint 9)

1. Provision Render API service with env vars and `npm run start`.
2. Provision Vercel frontend with `VITE_API_BASE_URL` pointing to Render API.
3. Confirm production CORS (`FRONTEND_URL`) matches Vercel origin.
4. Run smoke tests against hosted URLs.
5. Write final submission write-up (`WRITEUP.md`).
