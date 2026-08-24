# Data Audit — Ironbark Ridge Resources

**Audit date:** 22 August 2026
**Method:** Automated Python inspection + manual review of all five CSV files
**Data location:** `data/`
**Coverage period claimed:** January 2025 – June 2026 (18 months)

---

## Executive summary

The five source files are usable but messy. The highest-risk issues for compliance reporting are:

1. **Fuel unit inconsistency** (`L`, `litres`, `Litres`, `kL`) — incorrect kL handling would materially understate Scope 1 emissions.
2. **Seven exact duplicate fuel rows** — 416,265 L of diesel if duplicate copies were included in emissions; first copy remains canonical, second copy rejected from calculations with full source evidence preserved.
3. **MTR-07 electricity scale shift** (Oct 2025) — one meter drops ~1000× while others stay stable; readings remain in primary Scope 2 totals (unit is kWh; correction cannot be proved), flagged prominently — Scope 2 may be **understated**.
4. **March 2026 site-wide grid drop + diesel spike** — strongly correlated with substation failure incident INC-2026-131; candidate for cross-dataset insight.
5. **Mixed incident severity formats** — numeric (1–3), `Low`, and `Medium` cannot be aggregated without normalisation.
6. **Two serious injuries recorded as severity `1`** — AI + rules should flag for human review, not auto-upgrade.

No source rows should be silently discarded. Every fixed, flagged, or rejected decision must be logged with source filename, source row, original value, cleaned value, action, and explanation.

---

## File inventory

| File | Data rows | Columns | Notes |
|------|-----------|---------|-------|
| `data/fuel_deliveries.csv` | **150** | 7 | Headers contain leading/trailing whitespace |
| `data/electricity_meter_readings.csv` | **108** | 5 | Clean structure; MTR-06 absent |
| `data/incident_register.csv` | **42** | 6 | One reused `incident_id`; free-text descriptions |
| `data/suppliers.csv` | **15** | 4 | Reference data only (no emission factors for spend) |
| `data/emission_factors.csv` | **3** | 5 | Clean — use exactly as supplied |

---

## 1. `fuel_deliveries.csv`

### Columns (exact headers)

| # | Header (as in file) | Normalised name |
|---|---------------------|-----------------|
| 0 | `Invoice No` | `invoice_no` |
| 1 | ` Delivery Date` | `delivery_date` *(leading space)* |
| 2 | `Fuel Type ` | `fuel_type` *(trailing space)* |
| 3 | `Quantity` | `quantity` |
| 4 | ` Unit` | `unit` *(leading space)* |
| 5 | `Cost (AUD)` | `cost_aud` |
| 6 | `Site Area` | `site_area` |

### Missing values

| Field | Missing count |
|-------|---------------|
| All fields | **0 / 150** |

Every row has 7 populated fields. No empty cells detected.

### Date formats

| Format | Count | Example |
|--------|-------|---------|
| DD/MM/YYYY | 100 | `21/05/2026` |
| Mon-YY | 29 | `Oct-25`, `Feb-26` |
| ISO 8601 | 21 | `2025-12-19` |
| Unparseable | 0 | — |

**Month-only dates (`Mon-YY`):** 29 rows. Do **not** invent an exact delivery day. Proposed storage model:

| Field | Example (Oct-25) | Meaning |
|-------|------------------|---------|
| `delivery_date` | `null` | Exact delivery day unknown |
| `reporting_month` | `2025-10-01` | First day of month — **reporting anchor only**, not claimed as actual delivery date |
| `date_precision` | `month` | Signals month-level precision |

Flag every row with `date_precision = month` in the data-quality report.

### Units

| Unit value | Count |
|------------|-------|
| `L` | 106 |
| `litres` | 19 |
| `Litres` | 14 |
| `kL` | 11 |

All represent volume. Normalisation rule: `L` / `litres` / `Litres` → litres as-is; `kL` → × 1,000 litres.

### Fuel types

| Type | Count |
|------|-------|
| Diesel | 133 |
| Petrol (ULP) | 17 |

Maps to emission factors: Diesel → 2.70 kg CO2e/L (Scope 1); Petrol (ULP) → 2.31 kg CO2e/L (Scope 1).

### Cost (AUD) formats

| Pattern | Count |
|---------|-------|
| Plain numeric | 95 |
| With `$` prefix | 55 |
| With thousands comma | 55 |

Same row may have both `$` and comma. Normalise by stripping `$`, commas, then parse as decimal.

### Duplicates

**Exact duplicate rows:** 7 groups (7 extra copies; **143 unique rows** after rejecting duplicate copies from emissions)

| Invoice No | Delivery Date | Quantity | Occurrences |
|------------|---------------|----------|-------------|
| INV-40497 | Aug-25 | 36,216 L | 2 |
| INV-40349 | 09/05/2025 | 63,515 L | 2 |
| INV-40357 | 09/05/2025 | 70,670 Litres | 2 |
| INV-40715 | 26/01/2026 | 29,261 litres | 2 |
| INV-40292 | 23/03/2025 | 74,568 L | 2 |
| INV-40962 | Jun-26 | 71,897 L | 2 |
| INV-40266 | Mar-25 | 70,138 L | 2 |

All 7 re-used invoice numbers are **exact row duplicates** (same date, qty, unit, cost, site). No partial duplicates found.

**Duplicate copy handling:**

| Field | Value |
|-------|-------|
| `action` | `rejected` |
| `issue_code` | `EXACT_DUPLICATE` |
| `include_in_emissions` | `false` (second and subsequent copies only) |

The **first** occurrence of each exact row (lowest source row number) remains canonical (`include_in_emissions = true`). Every duplicate copy is **preserved** in the database with full source filename and source row — rejected only from curated emissions calculations.

**Verified impact of duplicate copies:** 416,265 L diesel (~1.12M kg CO2e overstatement if included).

### Anomalies

| Issue | Row(s) | Detail |
|-------|--------|--------|
| Credit/reversal | INV-41777 (row 123) | qty = −12,500 L, cost = −$23,375.00 (14/08/2025, Haul Fleet) |
| Large deliveries (>100k L) | 11 rows | Largest: INV-40822 = 159,134 L (Mar 2026) |
| Missing month | — | **November 2025 contains no fuel deliveries** (confirmed gap in monthly series) |
| kL rows | 11 rows | e.g. INV-40373: 84.03 kL = 84,030 L |

### Site areas

| Site | Deliveries |
|------|------------|
| Open Cut - North Pit | 37 |
| Processing Plant | 32 |
| Open Cut - South Pit | 27 |
| Haul Fleet | 24 |
| Light Vehicles | 20 |
| Site Services | 10 |

### Estimated Scope 1 (deduped exact rows only)

| Fuel | Normalised volume | Emissions (kg CO2e) |
|------|-------------------|---------------------|
| Diesel | 8,102,791 L | 21,877,536 |
| Petrol (ULP) | 75,731 L | 174,939 |
| **Total Scope 1** | | **~22.05M kg CO2e** |

*Preliminary estimate for canonical rows only (`include_in_emissions = true`); excludes rejected duplicate copies. Credit row (INV-41777) negative qty/cost unchanged and flagged as possible reversal.*

---

## 2. `electricity_meter_readings.csv`

### Columns

`meter_id`, `meter_description`, `period`, `consumption`, `unit`

### Missing values

None. All 108 rows complete.

### Meters and coverage

| Meter | Description | Periods | Range |
|-------|-------------|---------|-------|
| MTR-01 | Processing Plant | 18 | 2025-01 → 2026-06 |
| MTR-02 | CHPP Conveyors | 18 | 2025-01 → 2026-06 |
| MTR-03 | Admin & Camp | 18 | 2025-01 → 2026-06 |
| MTR-04 | Workshops | 18 | 2025-01 → 2026-06 |
| MTR-05 | Water Management | 18 | 2025-01 → 2026-06 |
| MTR-07 | Ventilation & Dewatering | 18 | 2025-01 → 2026-06 |
| **MTR-06** | **Absent** | 0 | **Gap in meter numbering** |

6 meters × 18 months = 108 rows. No duplicate meter+period combinations.

### Units

All rows: `kWh`. No normalisation required for unit string.

### MTR-07 scale shift (critical — flag prominently)

| Period range | Typical consumption | Notes |
|--------------|---------------------|-------|
| 2025-01 → 2025-09 | ~244,000 – 275,000 kWh | Consistent with other large meters |
| 2025-10 → 2026-06 | ~85 – 277 kWh | **~1000× drop** from Sep 2025 |

Example: MTR-07 Sep 2025 = 274,790.9 kWh → Oct 2025 = 277.0 kWh.

Other meters show no comparable shift. This pattern suggests a possible unit/decimal/read error, but the supplied unit is `kWh` and **we cannot prove the correct value**.

**Decision:** Include all MTR-07 readings in **primary Scope 2 totals**. Do **not** automatically multiply, exclude, or correct post-Oct 2025 values. Flag the scale shift prominently in the data-quality report and dashboard. **Scope 2 may be understated** because post-shift MTR-07 values are far lower than pre-shift values.

### March 2026 site-wide drop

| Metric | Feb 2026 | Mar 2026 | Change |
|--------|----------|----------|--------|
| Total site kWh (all meters) | 1,731,113.3 | 629,211.8 | **−63.65%** |

Per-meter Mar/Feb ratios: ~31–39% across MTR-01 to MTR-05 — consistent **site-wide** reduction, not single-meter fault. MTR-07 also drops (85.1 kWh vs 244.6 kWh in Feb 2026) but at a scale already affected by the Oct 2025 shift.

### Estimated Scope 2

| Scenario | Total kWh | Emissions (kg CO2e @ 0.71) |
|----------|-----------|---------------------------|
| **Primary (all meters, as supplied)** | 32,863,712.8 | 23,333,236 |

All MTR-07 readings are included. The ~1000× MTR-07 scale shift from Oct 2025 is flagged; Scope 2 may be **understated** relative to true consumption.

---

## 3. `incident_register.csv`

### Columns

`incident_id`, `incident_date`, `location`, `type_code`, `severity`, `description`

**Naming note:** `location` holds site areas (e.g. "Haul Fleet"); `type_code` holds category codes (e.g. DUS, VEH). Do not swap these during ingestion.

### Missing values

None across all 42 rows.

### Date formats

All 42 rows: DD/MM/YYYY. No ISO dates. 38 unique dates (some dates have multiple incidents).

### Duplicate identifiers

| incident_id | Occurrences | Detail |
|-------------|-------------|--------|
| INC-2025-011 | 2 | Different dates (02/06/2025 vs 19/06/2025), types (VEH vs ENV), severities (1 vs Low) |

**Decision:** `incident_id` from the source file is **not** a unique key. Each row gets an internally generated UUID as the database primary key (`incidents.id`). Preserve `source_incident_id` (raw `incident_id` column) and `source_row` as normal traceability fields. Flag reused source IDs with `issue_code = DUPLICATE_SOURCE_IDENTIFIER`; preserve both incidents under separate internal UUIDs.

### Severity values (mixed formats)

| Raw value | Count |
|-----------|-------|
| `1` | 15 |
| `2` | 14 |
| `Low` | 10 |
| `3` | 2 |
| `Medium` | 1 |

**Proposed normalisation map (to be confirmed in schema):**

| Raw | Normalised rank | Label |
|-----|-----------------|-------|
| Low | 1 | Low |
| 1 | 1 | Low |
| Medium | 2 | Medium |
| 2 | 2 | Medium |
| 3 | 3 | High |

Store both `severity_raw` and `severity_normalised`. Flag `Medium` and word/numeric mixes for transparency.

### Type codes (`type_code` column)

| Code | Count | Meaning (inferred) |
|------|-------|--------------------|
| VEH | 13 | Vehicle |
| EQP | 8 | Equipment |
| ENV | 7 | Environmental |
| DUS | 6 | Dust |
| OTH | 4 | Other |
| SLP | 3 | Slip/trip/fall |
| ELE | 1 | Electrical |

### Locations (`location` column — site areas)

| Location | Count |
|----------|-------|
| Open Cut - North Pit | 9 |
| Open Cut - South Pit | 8 |
| Haul Fleet | 8 |
| Light Vehicles | 8 |
| Site Services | 5 |
| Processing Plant | 4 |

### Repeated incident-description patterns

Nine description texts appear more than once. These are **not** automatically data errors — they may indicate **recurring hazards** or **templated reporting** and should be reviewed:

| Description (truncated) | Count | Incident IDs |
|---------------------------|-------|--------------|
| Service truck tyre blowout… | 5 | INC-2025-001, -003, -016, -019, INC-2026-032 |
| Hydrocarbon sheen in V-drain… | 5 | INC-2025-009, -010, -013, -015, -017 |
| Dust exceedance at crusher… | 4 | INC-2025-002, -014, INC-2026-026, -030 |
| Dozer track tension failure… | 4 | INC-2025-004, -018, INC-2026-027, -033 |
| LV exceeded speed limit… | 4 | INC-2025-011, -012, INC-2026-025, -029 |
| Worker respiratory irritation… | 2 | INC-2025-007, INC-2026-031 |
| Haul truck / water cart interaction… | 2 | INC-2025-008, INC-2026-021 |
| Hydraulic hose failure EX-214… | 2 | INC-2026-020, -023 |
| Light vehicle reversed into bund… | 2 | INC-2026-024, -028 |

Each occurrence has a distinct `incident_id` and date. **Flagged** for human review; do not reject.

### Psychosocial hazards (OTH type_code)

| ID | Date | Severity | Description (truncated) |
|----|------|----------|-------------------------|
| INC-2025-127 | 08/07/2025 | 1 | Verbal abuse from supervisor, anxiety before shift |
| INC-2025-152 | 11/12/2025 | 2 | Overwhelmed by overtime/understaffing |
| INC-2026-109 | 03/02/2026 | 1 | Exclusion after raising safety concern, stress, poor sleep |
| INC-2026-134 | 24/03/2026 | 2 | Fatigue after extended shifts during March power outage |

AI layer should re-classify these (and scan all descriptions) for psychosocial hazards regardless of `OTH` code.

### Severity vs description mismatches (candidates for AI flag)

| ID | Recorded severity | Description signal |
|----|-------------------|-------------------|
| INC-2025-118 | 1 (Low) | Fractured forearm, hospital surgery |
| INC-2025-141 | 1 (Low) | Two fingers lacerated, sutures, **LTI recorded** |
| INC-2026-021 | Medium | Same text as INC-2025-008 (severity 3) — haul truck interaction |

Recommend human review; do not silently change severity.

---

## 4. `suppliers.csv`

### Columns

`supplier_name`, `abn`, `category`, `fy_spend_aud`

### Missing values

| Field | Missing |
|-------|---------|
| abn | 2 / 15 |

Missing ABN: Ironline Fuel Distributors P/L, SafeGuard PPE Supplies.

### ABN validation

| Supplier | ABN | Digit count | Valid (11 digits)? |
|----------|-----|-------------|-------------------|
| TerraForm Rehabilitation Co | 5501822 | 7 | **No** |
| Ironline Fuel Distributors P/L | *(empty)* | 0 | **No** |
| SafeGuard PPE Supplies | *(empty)* | 0 | **No** |
| All others | — | 11 | Yes |

### Duplicate / variant entities

| Issue | Records |
|-------|---------|
| Same ABN, different spelling | Blackwood Heavy Maintenance + Blackwood Heavy Maintanence (ABN 84 112 334 908) |
| Likely same entity, missing ABN | Ironline Fuel Distributors Pty Ltd (ABN present) + Ironline Fuel Distributors P/L (no ABN) |
| Category inconsistency | "Fuel supply" vs "Fuel" for Ironline variants |

**Scope note:** No supplier-spend emission factors supplied — ingest for data-quality reporting only; **do not** calculate Scope 3.

---

## 5. `emission_factors.csv`

Clean reference data. Use exactly as provided.

| Activity | Scope | Unit | kg CO2e/unit |
|----------|-------|------|--------------|
| Diesel combustion (stationary & transport) | 1 | L | 2.70 |
| Petrol (ULP) combustion | 1 | L | 2.31 |
| Grid electricity - Queensland | 2 | kWh | 0.71 |

---

## Cross-dataset relationships

### March 2026 substation event (strong correlation — not proven causation)

| Dataset | Feb 2026 | Mar 2026 | Signal |
|---------|----------|----------|--------|
| Site grid electricity (all meters) | 1,731,113.3 kWh | 629,211.8 kWh | **−63.65%** |
| Diesel deliveries (deduped) | 482,246 L | 697,951 L | **+44.73%** |
| Scope 2 delta | — | — | ~−782,000 kg CO2e |
| Scope 1 delta (diesel only) | — | — | ~+582,000 kg CO2e |

**Supporting incidents:**

- **INC-2026-131** (06/03/2026, ELE, severity 3): "Regional substation failure… Backup diesel generators run continuously for approximately three weeks… Refuelling contractors on site daily."
- **INC-2026-134** (24/03/2026, OTH, severity 2): Fatigue from extended shifts covering generator operations during March power outage.

**Mar 2026 large fuel deliveries:**

| Invoice | Litres | Site |
|---------|--------|------|
| INV-40822 | 159,134 | Open Cut - North Pit |
| INV-40808 | 125,320 | Processing Plant |
| INV-40821 | 122,810 | Open Cut - North Pit |
| INV-40803 | 115,595 | Open Cut - South Pit |
| INV-40815 | 100,209 | Open Cut - South Pit |

**Presentation:** Cite as correlated pattern across electricity, fuel, and incident records. Net emissions effect depends on generator efficiency assumptions not in the data.

### MTR-07 vs other meters

Only MTR-07 shows the Oct 2025 scale shift. Unrelated to March 2026 event (which affects all meters proportionally).

### Fuel supplier ↔ fuel deliveries

Ironline Fuel Distributors appears in suppliers ($8.94M + $1.21M). No direct join key to invoices — correlation is contextual only.

---

## Fixed / Flagged / Rejected decision table

| # | Dataset | Issue | Action | Rationale |
|---|---------|-------|--------|-----------|
| 1 | Fuel | Header whitespace | **Fixed** | Trim on parse; log original header names |
| 2 | Fuel | Date format mix (ISO, DD/MM/YYYY, Mon-YY) | **Fixed** + **Flagged** | Full dates → `delivery_date`; Mon-YY → `delivery_date = null`, `reporting_month`, `date_precision = month` |
| 3 | Fuel | Unit variants (L, litres, Litres, kL) | **Fixed** | Normalise to litres; kL × 1000 |
| 4 | Fuel | Cost format ($, commas) | **Fixed** | Strip symbols; store raw + parsed |
| 5 | Fuel | Exact duplicate rows (7 copies) | **Rejected** | `action = rejected`, `issue_code = EXACT_DUPLICATE`, `include_in_emissions = false` for second copy; preserve source evidence |
| 6 | Fuel | Negative qty/cost (INV-41777) | **Flagged** | Negative quantity and cost remain unchanged as a possible credit/reversal; currency-string parsing is a separate deterministic **Fixed** action (item 4) |
| 7 | Fuel | Large deliveries (>100k L) | **Flagged** | Unusual but plausible (Mar 2026 outage); do not reject |
| 8 | Fuel | November 2025 gap | **Flagged** | No fuel deliveries in Nov 2025 — no imputation |
| 9 | Electricity | MTR-06 absent | **Flagged** | Document gap; do not invent meter |
| 10 | Electricity | MTR-07 scale shift (Oct 2025+) | **Flagged** | Include in primary Scope 2 totals; flag ~1000× shift; Scope 2 may be understated |
| 11 | Electricity | March 2026 site-wide drop | **Flagged** | Expected given substation event; link to INC-2026-131 |
| 12 | Incidents | Duplicate incident_id (INC-2025-011) | **Flagged** | `issue_code = DUPLICATE_SOURCE_IDENTIFIER`; preserve both incidents under separate internal UUIDs |
| 13 | Incidents | Mixed severity formats | **Fixed** + store raw | Normalise to rank; never overwrite raw |
| 14 | Incidents | Severity/description mismatch | **Flagged** (AI-assisted) | Recommend review; do not auto-change severity |
| 15 | Incidents | Psychosocial under OTH | **Flagged** (AI-assisted) | Re-classify with evidence excerpt |
| 16 | Incidents | Repeated description patterns | **Flagged** | May indicate recurring hazards or templated reporting; review, do not reject |
| 17 | Suppliers | Missing ABN | **Flagged** | Ingest row; mark incomplete |
| 18 | Suppliers | Invalid ABN length (TerraForm) | **Flagged** | Ingest row; mark invalid |
| 19 | Suppliers | Duplicate entities (Blackwood, Ironline) | **Flagged** | Suggest merge candidates; do not auto-merge |
| 20 | Emission factors | — | **Use as-is** | Authoritative reference |

---

## Assumptions requiring caution

| Assumption | Risk | Mitigation |
|------------|------|------------|
| Mon-YY → `reporting_month` anchor, not delivery day | Users may misread as exact date | `delivery_date = null`, `date_precision = month`; flag in UI |
| First copy of exact duplicate is canonical | Wrong ordering could pick wrong copy | Deterministic rule: lowest source row number wins |
| MTR-07 post-Oct readings included as kWh | Scope 2 may be understated | Flag prominently; do not auto-correct |
| Severity map (Low=1, Medium=2, 3=High) | Client may use different scale | Store raw; document map |
| Credit row (INV-41777) negative values unchanged | May be accounting not physical | Flag as possible reversal; do not alter sign |
| November 2025 fuel gap is missing export | Could be zero activity | Do not impute; confirmed no deliveries |
| Diesel factor applies to all diesel regardless of site | Factors file has no site split | Match fuel type only |
| LLM psychosocial classification | False positives/negatives | Confidence + human review flag |

---

## Proposed high-level architecture

```
data/*.csv
    │
    ▼
┌─────────────────────────────────────┐
│  Ingestion CLI (Node/TS)            │
│  csv-parse → Zod validate → clean   │
│  → PostgreSQL (parameterised SQL)   │
│  → data_quality_issues (every issue)│
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│  PostgreSQL (Neon)                  │
│  • ingestion_runs                   │
│  • fuel_deliveries                  │
│  • electricity_readings             │
│  • incidents                        │
│  • suppliers                        │
│  • emission_factors                 │
│  • data_quality_issues              │
│  • ai_incident_analysis             │
└─────────────────────────────────────┘
    │
    ├──────────────────────┐
    ▼                      ▼
┌──────────────┐    ┌──────────────────┐
│ Express API  │    │ AI batch job     │
│ /emissions   │    │ OpenAI structured│
│ /incidents   │    │ outputs + Zod    │
│ /quality     │    │ validation       │
│ /evidence    │    └──────────────────┘
└──────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│  Vue 3 + Vite + Tailwind dashboard  │
│  Single screen: emissions, trends,  │
│  AI findings, quality, evidence     │
└─────────────────────────────────────┘
```

**Repository layout (Checkpoint 2):**

```
/
├── api/                 # Express + ingestion + migrations
├── web/                 # Vue 3 frontend
├── docs/
│   └── DATA_AUDIT.md    # this file
├── data/                # source CSVs (unchanged)
├── README.md
├── WRITEUP.md
└── .env.example
```

**Key design principles:**

- One DB row per source row (raw + normalised columns together)
- Every quality action logged with full traceability
- Duplicate copies preserved but excluded from emissions via `include_in_emissions = false`
- Rerunnable ingestion: the complete filename/SHA-256 set is compared against prior completed ingestion runs; an exact match skips safely, otherwise a new versioned run is created
- Deterministic emissions in SQL/TypeScript — never via LLM
- AI assessments link to the internal `incidents.id` UUID; `source_incident_id` and `source_row` remain supporting evidence

---

## Likely interview question

**"Why exclude exact duplicate copies from emissions while preserving them in the database?"**

**Strong answer:** "The first occurrence of each exact duplicate row is the canonical record and feeds emissions calculations. Each duplicate copy is still loaded with its original source filename and row number so we retain full evidence and audit trail. We set `action = rejected`, `issue_code = EXACT_DUPLICATE`, and `include_in_emissions = false` on duplicate copies only — they are rejected from curated calculations, not deleted. That prevents double-counting 416,265 L of diesel while keeping every source problem visible and explainable."

---

## Subsequent implementation

The architecture described above was subsequently implemented. See [`README.md`](../README.md) and [`WRITEUP.md`](../WRITEUP.md) for how to run the system and inspect the hosted deployment.
