# AI Incident Classification Evaluation

**Checkpoint 6 — Ironbark Ridge Resources**

## Active configuration

| Setting | Value |
|---------|-------|
| Model | `gpt-4o-mini` (from `OPENAI_MODEL`; not hard-coded in application source) |
| Active prompt version | `incident-classification-v3` |
| SDK | OpenAI JavaScript SDK with `beta.chat.completions.parse` + `zodResponseFormat` |
| Schema | Zod structured output (`zod3` alias for OpenAI compatibility) |
| Grounding | Verbatim substring validation; nullable excerpts for psychosocial `"no"` and severity `"consistent"` with deterministic source context on storage |

Stored findings from earlier prompt versions remain in `ai_incident_analysis` and are **not** deleted, updated, or overwritten. Each prompt version creates a separate auditable analysis set under `(incident_id, finding_type, model, prompt_version)`.

Verification: `npm run verify:ai` (read-only completeness and traceability checks for the active model + prompt version).

---

## Development history — gpt-5-mini quota failures

Before any findings were stored, two development runs against `gpt-5-mini` failed with OpenAI `429 insufficient_quota`.

| Metric | Result |
|--------|--------|
| Runs | 2 |
| Incidents attempted (each) | 42 |
| Completed | 0 |
| Stored findings | 0 |
| Cause | Billing quota exhausted |

These runs are distinct from the later `gpt-4o-mini` v1–v3 runs.

---

## Live run — gpt-4o-mini + incident-classification-v1

| Metric | Result |
|--------|--------|
| Model | `gpt-4o-mini` |
| Prompt | `incident-classification-v1` |
| Attempted | 42 |
| Completed | 4 |
| Failed | 38 |
| Failure mode | Psychosocial evidence excerpt was not a verbatim source substring |

### Root cause

For psychosocial assessment `"no"`, absence of a hazard cannot be evidenced by a source substring. v1 required a non-null excerpt for every assessment. The model invented conclusions such as “No psychosocial hazard mentioned,” which fail deterministic grounding.

Fail-closed validation correctly rejected those 38 responses. The 4 completed incidents remain stored under `incident-classification-v1`. v1 rows were **not** corrected in place or deleted.

---

## Live run — gpt-4o-mini + incident-classification-v2 (immutable)

| Metric | Result |
|--------|--------|
| Model | `gpt-4o-mini` |
| Prompt | `incident-classification-v2` |
| Attempted | 42 |
| Completed | 13 |
| Failed | 29 |
| Failure mode | Severity evidence excerpt was not a verbatim source substring |

### Root cause

v2 fixed psychosocial `"no"` (nullable excerpt + deterministic source context) but still required a **non-null verbatim** `severityEvidenceExcerpt` for every severity assessment, including `"consistent"`. For routine incidents the model judged severity consistent and invented text such as “no serious injury” or “severity appears appropriate,” which is not in the source description.

Fail-closed validation correctly rejected those 29 responses. The original live v2 outcome remains **13 completed / 29 rejected**.

### Immutability note

The v2 prompt file must not be edited after stored findings exist. An in-place severity-null edit would have mixed two behaviours under one version; that change was moved to **v3** and the original v2 prompt text was restored. Existing v1/v2 database rows remain immutable.

---

## Live run — gpt-4o-mini + incident-classification-v3

| Metric | Result |
|--------|--------|
| Model | `gpt-4o-mini` |
| Prompt | `incident-classification-v3` |
| First CLI run attempted | 42 |
| First CLI run completed | 42 |
| First CLI run skipped | 0 |
| First CLI run failed | 0 |
| Immediate second CLI run | attempted 0, completed 0, **skipped 42**, failed 0 |
| API summary | analysed 42, pending 0 |

### Prompt change from v2

| Area | Behaviour |
|------|-----------|
| Psychosocial | Unchanged from v2 (nullable `"no"`, verbatim `"yes"`/`"uncertain"`) |
| Severity `"consistent"` | `severityEvidenceExcerpt` must be `null`; deterministic source context stored |
| Severity `"possibly_understated"` / `"possibly_overstated"` / `"uncertain"` | Non-null verbatim excerpt required (fail closed) |
| Category | Verbatim excerpt required |

### Aggregate v3 counts (latest completed ingestion run)

| Dimension | Count |
|-----------|-------|
| Total incidents | 42 |
| Complete analyses (3 finding types each) | 42 |
| Finding rows | 126 |
| Psychosocial **yes** | 3 |
| Psychosocial **no** | 39 |
| Psychosocial **uncertain** | 0 |
| Severity possibly inconsistent | 7 |
| Severity consistent | 35 |
| Severity uncertain | 0 |

#### Safety category distribution

| Category | Count |
|----------|-------|
| vehicle_and_mobile_equipment | 13 |
| hazardous_materials_and_dust | 13 |
| equipment_and_machinery | 6 |
| psychosocial | 3 |
| slips_trips_and_falls | 3 |
| environmental | 2 |
| fatigue | 1 |
| electrical | 1 |
| other | 0 |

---

## Inspected findings (source + stored v3 evidence)

Every inspected excerpt below is a substring of the source `description`. Each finding links to internal `incident.id`, `source_incident_id`, `source_filename = incident_register.csv`, and `source_row`.

### Psychosocial yes (3)

| Source ID | UUID (prefix) | Row | Recorded severity | Excerpt | Assessment |
|-----------|---------------|-----|-------------------|---------|------------|
| INC-2025-127 | `91ab925d-…` | 16 | Low / 1 | `repeated verbal abuse from supervisor over several weeks` | **yes** — verbal abuse + anxiety |
| INC-2025-152 | `e9bf85b6-…` | 25 | Medium / 2 | `feeling overwhelmed by sustained overtime and understaffing on night shift` | **yes** — work pressure + confidential support request |
| INC-2026-109 | `06fb3ead-…` | 27 | Low / 1 | `ongoing stress and poor sleep` | **yes** — exclusion after safety concern |

### Severity possibly inconsistent (7)

| Source ID | Row | Recorded | Evidence excerpt | Notes |
|-----------|-----|----------|------------------|-------|
| INC-2025-118 | 12 | Low / 1 | `fractured forearm, transported to Mater Hospital for surgery` | Strong understatement signal |
| INC-2025-141 | 21 | Low / 1 | `two fingers lacerated requiring sutures, LTI recorded` | Strong understatement; LTI recorded |
| INC-2025-127 | 16 | Low / 1 | `feeling anxious before shift` | Psychosocial incident also flagged for severity |
| INC-2025-152 | 25 | Medium / 2 | `feeling overwhelmed by sustained overtime and understaffing on night shift` | Same psychosocial signal reused for severity |
| INC-2026-109 | 27 | Low / 1 | `exclusion from toolbox talks and rostering decisions after raising a safety concern` | Psychosocial + severity overlap |
| INC-2026-029 | 38 | Low / 1 | `exceeded speed limit` | Routine IVMS coaching event |
| INC-2026-134 | 34 | Medium / 2 | `fatigue after extended shifts covering generator operations` | Fatigue during March outage; also psychosocial FN below |

### INC-2026-134 (human-review disagreement)

| Field | Value |
|-------|-------|
| Source ID | INC-2026-134 |
| Internal UUID | `2ab7ecc5-9f72-4aba-bb01-4b4b27373bbd` |
| Source | `incident_register.csv` row 34 |
| Description | Multiple crews reporting fatigue after extended shifts covering generator operations and manual restarts during the March power outage. |
| Category (v3) | `fatigue` — excerpt `fatigue after extended shifts covering generator operations` |
| Psychosocial (v3) | **no** — stored deterministic full-description context (null model excerpt path) |
| Severity (v3) | possibly inconsistent — same fatigue excerpt |

**Disagreement:** DATA_AUDIT and the prompt’s psychosocial examples treat “fatigue from excessive hours” as a psychosocial hazard signal. A human reviewer would expect psychosocial **yes** (or at least uncertain). The model chose category `fatigue` and psychosocial **no**.

**Why grounded output can still be wrong:** Grounding only proves the excerpt exists in the source text. It does **not** prove that the assessment label is correct. INC-2026-134’s psychosocial `"no"` path correctly stored deterministic source context with no invented absence phrase — yet the classification judgment remains contestable. Stored AI output was **not** modified.

---

## Manual false-positive / false-negative evaluation

### Psychosocial

| Case | Judgment | Rationale |
|------|----------|-----------|
| INC-2025-127, 152, 109 | **True positives** | Clear harassment / work-pressure / exclusion language |
| INC-2026-134 | **False negative** (human disagreement) | Extended-shift fatigue is a psychosocial risk in this dataset; model said no |
| Other 38 psychosocial=no | **Likely true negatives** on spot-check of physical/environmental narratives | No additional clear psychosocial misses identified beyond INC-2026-134 |

### Severity inconsistency

| Case | Judgment | Rationale |
|------|----------|-----------|
| INC-2025-118, INC-2025-141 | **True positives** | Serious injury / LTI vs recorded Low |
| INC-2025-127, 152, 109 | **Borderline / weak positives** | Severity flags recycle psychosocial harm language; reasonable for review queue, not strong clinical understatement |
| INC-2026-029 | **Likely false positive** | Speed exceedance + coaching is a routine Low event; excerpt does not show serious harm |
| INC-2026-134 | **Borderline positive** | Multi-crew fatigue during prolonged outage may understate Medium; useful for review |
| INC-2026-021 vs INC-2025-008 | **False negative** | Identical haul-truck text coded Medium vs High; single-incident model cannot see the cross-record mismatch and marked both consistent |

Uncertain assessments: **0** for psychosocial and severity under v3.

---

## Expected review targets vs v3 outcomes

### Psychosocial (from DATA_AUDIT.md)

| Source ID | Expected signal | v3 psychosocial |
|-----------|-----------------|-----------------|
| INC-2025-127 | Verbal abuse / anxiety | yes |
| INC-2025-152 | Overtime / understaffing | yes |
| INC-2026-109 | Exclusion / stress | yes |
| INC-2026-134 | Fatigue / extended shifts | **no** (disagreement) |

### Severity candidates (from DATA_AUDIT.md)

| Source ID | Expected signal | v3 severity |
|-----------|-----------------|-------------|
| INC-2025-118 | Fracture / surgery vs Low | possibly inconsistent |
| INC-2025-141 | Laceration / LTI vs Low | possibly inconsistent |
| INC-2026-021 | Same text as High twin | **consistent** (missed cross-record issue) |

---

## Evaluation status

| Run | Status |
|-----|--------|
| gpt-5-mini (quota) | Historical — no findings stored |
| gpt-4o-mini + v1 | Partial — 4 stored, 38 fail-closed; **immutable** |
| gpt-4o-mini + v2 | Partial original run — 13 stored, 29 fail-closed; **immutable** |
| gpt-4o-mini + v3 | **Complete** — 42/42; second run skipped 42 |

| Review area | Status |
|-------------|--------|
| Psychosocial true positives | 3 confirmed (127, 152, 109) |
| Psychosocial false negatives | 1 human disagreement (INC-2026-134) |
| Psychosocial false positives | None identified among the 3 yes findings |
| Severity true positives | 2 strong (118, 141) |
| Severity weak / borderline | 127, 152, 109, 134 |
| Severity false positives | Likely INC-2026-029 |
| Severity false negatives | INC-2026-021 cross-record coding mismatch |
| Grounding failures (v3 live) | 0 |
| Uncertain outputs | 0 |

---

## Why v1 / v2 / v3 records remain immutable

- Changing a prompt after findings exist would make `prompt_version` lie about the instructions that produced the stored rows.
- API and CLI select the **active** `PROMPT_VERSION` (`incident-classification-v3`) for summary/review/skip logic; older versions stay queryable in the database.
- Historical failures (v1 psychosocial grounding; v2 severity grounding) are preserved as audit evidence of why later versions exist.
- Human disagreements (e.g. INC-2026-134) are documented here — they do **not** rewrite stored AI rows.

---

## Evidence grounding limitations

- Substring checks prevent invented quotes; they do not validate judgment quality.
- Psychosocial `"no"` and severity `"consistent"` store deterministic description context because `evidence_excerpt` is NOT NULL — humans must not treat that text as proof of absence or consistency.
- Cross-incident inconsistency (duplicate narratives with different severities) is invisible to a single-incident prompt.
- Category enum boundaries (e.g. `fatigue` vs `psychosocial`) can steer the model away from a psychosocial **yes** even when the source text mentions fatigue from extended shifts.
- All findings retain `requires_human_review = true`; AI never updates `incidents.severity_normalised`.

---

## Prompt limitations by version

### v1 (retained for audit)

- Required psychosocial excerpts for `"no"` assessments, forcing invented absence evidence.

### v2 (retained for audit)

- Fixed psychosocial nullable `"no"` but still required verbatim severity excerpts for `"consistent"`, causing 29 grounding failures on the original live run.

### v3

- Completes the corpus under fail-closed grounding.
- Still subject to classification judgment errors and cross-record blind spots documented above.

---

## Human review statement

All stored AI findings are written with `requires_human_review = true`. AI output sits beside source incidents in `ai_incident_analysis` and **never** updates `incidents.severity_normalised`. The sustainability lead should treat AI assessments as review prompts, not established facts.

---

## API usage / cost

Token usage and dollar cost were **not** confirmed from the OpenAI Usage dashboard in this evaluation. This repository does not record token counts locally. Do not invent a cost figure — check the OpenAI Usage page for the `gpt-4o-mini` window covering the v3 classify run if a figure is required.

---

## Prompt version policy

Do not edit stored v1, v2, or v3 records or their prompt files after findings exist for that version. Create a new prompt version (v4, …) for behavioural changes. API summary/review selects the active `PROMPT_VERSION` (currently v3) while older versions remain queryable in the database.
