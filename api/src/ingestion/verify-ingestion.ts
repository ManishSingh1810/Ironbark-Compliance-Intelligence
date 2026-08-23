import { closePool, query } from "../db/client.js";
import { ISSUE_CODES } from "../domain/constants.js";

interface CheckResult {
  name: string;
  passed: boolean;
  detail: string;
}

const EXPECTED_COUNTS = {
  ingestionRunFiles: 5,
  fuelDeliveries: 150,
  electricityReadings: 108,
  incidents: 42,
  suppliers: 15,
  emissionFactors: 3,
  fuelDuplicatesExcluded: 7,
  fuelCanonicalIncluded: 143,
} as const;

const EXPECTED_EMISSION_FACTORS = [
  {
    activity: "Diesel combustion (stationary & transport)",
    scope: 1,
    unit: "L",
    kgCo2ePerUnit: "2.700000",
    factorSource: "Indicative factor for this exercise",
  },
  {
    activity: "Petrol (ULP) combustion",
    scope: 1,
    unit: "L",
    kgCo2ePerUnit: "2.310000",
    factorSource: "Indicative factor for this exercise",
  },
  {
    activity: "Grid electricity - Queensland",
    scope: 2,
    unit: "kWh",
    kgCo2ePerUnit: "0.710000",
    factorSource: "Indicative factor for this exercise",
  },
] as const;

/** Expected data_quality_issues counts for the supplied dataset (latest completed run). */
const EXPECTED_QUALITY_ISSUE_COUNTS: ReadonlyArray<{
  action: string;
  issueCode: string;
  count: number;
}> = [
  { action: "fixed", issueCode: "HEADER_OR_VALUE_TRIM", count: 3 },
  { action: "flagged", issueCode: "CREDIT_REVERSAL", count: 1 },
  { action: "flagged", issueCode: "DUPLICATE_SOURCE_IDENTIFIER", count: 1 },
  { action: "flagged", issueCode: "DUPLICATE_SUPPLIER_ENTITY", count: 4 },
  { action: "flagged", issueCode: "FUEL_MONTH_GAP", count: 1 },
  { action: "flagged", issueCode: "INVALID_ABN", count: 1 },
  { action: "flagged", issueCode: "LARGE_DELIVERY", count: 11 },
  { action: "flagged", issueCode: "MISSING_ABN", count: 2 },
  { action: "flagged", issueCode: "MISSING_METER", count: 1 },
  { action: "flagged", issueCode: "MONTH_ONLY_DATE", count: 29 },
  { action: "flagged", issueCode: "MTR07_SCALE_SHIFT", count: 9 },
  { action: "flagged", issueCode: "SITE_ELECTRICITY_DROP", count: 1 },
  { action: "rejected", issueCode: "EXACT_DUPLICATE", count: 7 },
];

function pass(name: string, detail: string): CheckResult {
  return { name, passed: true, detail };
}

function fail(name: string, detail: string): CheckResult {
  return { name, passed: false, detail };
}

async function getLatestCompletedRunId(): Promise<string> {
  const result = await query<{ id: string; status: string }>(
    `SELECT id, status::text
     FROM ingestion_runs
     WHERE status = 'completed'
     ORDER BY completed_at DESC NULLS LAST, started_at DESC
     LIMIT 1`,
  );
  const run = result.rows[0];
  if (!run) {
    throw new Error("No completed ingestion run found");
  }
  return run.id;
}

async function runChecks(runId: string): Promise<CheckResult[]> {
  const checks: CheckResult[] = [];

  const runResult = await query<{ id: string; status: string }>(
    `SELECT id, status::text FROM ingestion_runs WHERE id = $1`,
    [runId],
  );
  const run = runResult.rows[0];
  if (run?.status === "completed") {
    checks.push(pass("ingestion run status", `run ${runId} is completed`));
  } else {
    checks.push(
      fail("ingestion run status", `run ${runId} has status ${run?.status ?? "missing"}`),
    );
  }

  const fileCount = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM ingestion_run_files WHERE ingestion_run_id = $1`,
    [runId],
  );
  const files = Number(fileCount.rows[0]?.count ?? 0);
  checks.push(
    files === EXPECTED_COUNTS.ingestionRunFiles
      ? pass("ingestion_run_files count", String(files))
      : fail(
          "ingestion_run_files count",
          `expected ${EXPECTED_COUNTS.ingestionRunFiles}, got ${files}`,
        ),
  );

  for (const [table, expected] of [
    ["fuel_deliveries", EXPECTED_COUNTS.fuelDeliveries],
    ["electricity_readings", EXPECTED_COUNTS.electricityReadings],
    ["incidents", EXPECTED_COUNTS.incidents],
    ["suppliers", EXPECTED_COUNTS.suppliers],
    ["emission_factors", EXPECTED_COUNTS.emissionFactors],
  ] as const) {
    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM ${table} WHERE ingestion_run_id = $1`,
      [runId],
    );
    const count = Number(countResult.rows[0]?.count ?? 0);
    checks.push(
      count === expected
        ? pass(`${table} count`, String(count))
        : fail(`${table} count`, `expected ${expected}, got ${count}`),
    );
  }

  const duplicateExcluded = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM fuel_deliveries
     WHERE ingestion_run_id = $1 AND include_in_emissions = FALSE`,
    [runId],
  );
  const duplicateCount = Number(duplicateExcluded.rows[0]?.count ?? 0);
  checks.push(
    duplicateCount === EXPECTED_COUNTS.fuelDuplicatesExcluded
      ? pass("fuel duplicate copies excluded from emissions", String(duplicateCount))
      : fail(
          "fuel duplicate copies excluded from emissions",
          `expected ${EXPECTED_COUNTS.fuelDuplicatesExcluded}, got ${duplicateCount}`,
        ),
  );

  const canonicalIncluded = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM fuel_deliveries
     WHERE ingestion_run_id = $1 AND include_in_emissions = TRUE`,
    [runId],
  );
  const canonicalCount = Number(canonicalIncluded.rows[0]?.count ?? 0);
  checks.push(
    canonicalCount === EXPECTED_COUNTS.fuelCanonicalIncluded
      ? pass("canonical fuel rows included in emissions", String(canonicalCount))
      : fail(
          "canonical fuel rows included in emissions",
          `expected ${EXPECTED_COUNTS.fuelCanonicalIncluded}, got ${canonicalCount}`,
        ),
  );

  const traceabilityTables = [
    "fuel_deliveries",
    "electricity_readings",
    "incidents",
    "suppliers",
    "emission_factors",
  ] as const;

  for (const table of traceabilityTables) {
    const missingTrace = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM ${table}
       WHERE ingestion_run_id = $1
         AND (source_filename IS NULL OR source_filename = '' OR source_row IS NULL)`,
      [runId],
    );
    const missing = Number(missingTrace.rows[0]?.count ?? 0);
    checks.push(
      missing === 0
        ? pass(`${table} traceability fields`, "all rows have source_filename and source_row")
        : fail(`${table} traceability fields`, `${missing} rows missing traceability`),
    );
  }

  const minSourceRow = await query<{ min_row: number | null }>(
    `SELECT MIN(source_row) AS min_row
     FROM (
       SELECT source_row FROM fuel_deliveries WHERE ingestion_run_id = $1
       UNION ALL
       SELECT source_row FROM electricity_readings WHERE ingestion_run_id = $1
       UNION ALL
       SELECT source_row FROM incidents WHERE ingestion_run_id = $1
       UNION ALL
       SELECT source_row FROM suppliers WHERE ingestion_run_id = $1
       UNION ALL
       SELECT source_row FROM emission_factors WHERE ingestion_run_id = $1
     ) AS all_rows`,
    [runId],
  );
  const minRow = minSourceRow.rows[0]?.min_row ?? null;
  checks.push(
    minRow === 2
      ? pass("minimum physical source_row", "all imported data rows begin at source_row 2")
      : fail("minimum physical source_row", `expected 2, got ${minRow ?? "null"}`),
  );

  const duplicateIncidents = await query<{ id: string; source_row: number }>(
    `SELECT id, source_row
     FROM incidents
     WHERE ingestion_run_id = $1 AND source_incident_id = 'INC-2025-011'
     ORDER BY source_row`,
    [runId],
  );
  if (duplicateIncidents.rows.length === 2 && duplicateIncidents.rows[0]?.id !== duplicateIncidents.rows[1]?.id) {
    checks.push(
      pass(
        "duplicate source incident IDs preserved",
        `INC-2025-011 stored as ${duplicateIncidents.rows.length} distinct internal UUIDs (rows ${duplicateIncidents.rows.map((row) => row.source_row).join(", ")})`,
      ),
    );
  } else {
    checks.push(
      fail(
        "duplicate source incident IDs preserved",
        `expected 2 distinct INC-2025-011 rows, got ${duplicateIncidents.rows.length}`,
      ),
    );
  }

  const creditRow = await query<{
    quantity_litres: string;
    cost_aud: string;
    issue_count: string;
  }>(
    `SELECT fd.quantity_litres::text, fd.cost_aud::text,
            COUNT(dqi.id)::text AS issue_count
     FROM fuel_deliveries fd
     LEFT JOIN data_quality_issues dqi
       ON dqi.ingestion_run_id = fd.ingestion_run_id
      AND dqi.entity_id = fd.id
      AND dqi.issue_code = $2
     WHERE fd.ingestion_run_id = $1 AND fd.invoice_no = 'INV-41777'
     GROUP BY fd.quantity_litres, fd.cost_aud`,
    [runId, ISSUE_CODES.CREDIT_REVERSAL],
  );
  const credit = creditRow.rows[0];
  if (
    credit &&
    Number(credit.quantity_litres) === -12500 &&
    Number(credit.cost_aud) === -23375 &&
    Number(credit.issue_count) >= 1
  ) {
    checks.push(
      pass(
        "INV-41777 credit reversal",
        "quantity_litres=-12500, cost_aud=-23375, CREDIT_REVERSAL issue present",
      ),
    );
  } else {
    checks.push(
      fail(
        "INV-41777 credit reversal",
        `unexpected values: qty=${credit?.quantity_litres ?? "missing"}, cost=${credit?.cost_aud ?? "missing"}, issues=${credit?.issue_count ?? "0"}`,
      ),
    );
  }

  const badKlConversion = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM fuel_deliveries
     WHERE ingestion_run_id = $1
       AND LOWER(TRIM(unit_raw)) = 'kl'
       AND quantity_litres IS DISTINCT FROM (NULLIF(REGEXP_REPLACE(quantity_raw, '[^0-9.-]', '', 'g'), '')::numeric * 1000)`,
    [runId],
  );
  const badKl = Number(badKlConversion.rows[0]?.count ?? 0);
  checks.push(
    badKl === 0
      ? pass("kL quantity_litres conversion", "all kL rows converted by ×1000")
      : fail("kL quantity_litres conversion", `${badKl} kL rows have incorrect quantity_litres`),
  );

  const monthOnlyBad = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM fuel_deliveries
     WHERE ingestion_run_id = $1
       AND date_precision = 'month'
       AND (delivery_date IS NOT NULL OR reporting_month IS NULL)`,
    [runId],
  );
  const monthOnlyCount = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM fuel_deliveries
     WHERE ingestion_run_id = $1 AND date_precision = 'month'`,
    [runId],
  );
  const badMonthOnly = Number(monthOnlyBad.rows[0]?.count ?? 0);
  const monthOnlyTotal = Number(monthOnlyCount.rows[0]?.count ?? 0);
  checks.push(
    badMonthOnly === 0 && monthOnlyTotal >= 1
      ? pass(
          "month-only fuel dates",
          `${monthOnlyTotal} rows with delivery_date null, reporting_month populated, date_precision=month`,
        )
      : fail(
          "month-only fuel dates",
          `month-only rows=${monthOnlyTotal}, invalid=${badMonthOnly}`,
        ),
  );

  const mtr07Oct = await query<{
    consumption_kwh: string;
    include_in_emissions: boolean;
    issue_count: string;
  }>(
    `SELECT er.consumption_kwh::text, er.include_in_emissions,
            COUNT(dqi.id)::text AS issue_count
     FROM electricity_readings er
     LEFT JOIN data_quality_issues dqi
       ON dqi.ingestion_run_id = er.ingestion_run_id
      AND dqi.entity_id = er.id
      AND dqi.issue_code = $3
     WHERE er.ingestion_run_id = $1
       AND er.meter_id = 'MTR-07'
       AND er.period_month = $2
     GROUP BY er.consumption_kwh, er.include_in_emissions`,
    [runId, "2025-10-01", ISSUE_CODES.MTR07_SCALE_SHIFT],
  );
  const mtr07 = mtr07Oct.rows[0];
  if (
    mtr07 &&
    Number(mtr07.consumption_kwh) === 277 &&
    mtr07.include_in_emissions === true &&
    Number(mtr07.issue_count) >= 1
  ) {
    checks.push(
      pass(
        "MTR-07 Oct 2025 scale shift",
        "consumption_kwh=277 unchanged, included in emissions, MTR07_SCALE_SHIFT flagged",
      ),
    );
  } else {
    checks.push(
      fail(
        "MTR-07 Oct 2025 scale shift",
        `consumption=${mtr07?.consumption_kwh ?? "missing"}, included=${mtr07?.include_in_emissions ?? "missing"}, issues=${mtr07?.issue_count ?? "0"}`,
      ),
    );
  }

  const fileLevelIssues = await query<{ issue_code: string; count: string }>(
    `SELECT issue_code, COUNT(*)::text AS count
     FROM data_quality_issues
     WHERE ingestion_run_id = $1
       AND source_row IS NULL
       AND issue_code = ANY($2::text[])
     GROUP BY issue_code
     ORDER BY issue_code`,
    [
      runId,
      [
        ISSUE_CODES.FUEL_MONTH_GAP,
        ISSUE_CODES.MISSING_METER,
        ISSUE_CODES.SITE_ELECTRICITY_DROP,
      ],
    ],
  );
  const fileIssueCodes = new Set(fileLevelIssues.rows.map((row) => row.issue_code));
  const requiredFileIssues = [
    ISSUE_CODES.FUEL_MONTH_GAP,
    ISSUE_CODES.MISSING_METER,
    ISSUE_CODES.SITE_ELECTRICITY_DROP,
  ];
  const missingFileIssues = requiredFileIssues.filter((code) => !fileIssueCodes.has(code));
  checks.push(
    missingFileIssues.length === 0
      ? pass(
          "file/period-level issues",
          `present: ${fileLevelIssues.rows.map((row) => `${row.issue_code}=${row.count}`).join(", ")} (source_row null)`,
        )
      : fail(
          "file/period-level issues",
          `missing issue codes: ${missingFileIssues.join(", ")}`,
        ),
  );

  const factors = await query<{
    activity: string;
    scope: number;
    unit: string;
    kg_co2e_per_unit: string;
    factor_source: string;
  }>(
    `SELECT activity, scope, unit, kg_co2e_per_unit::text, factor_source
     FROM emission_factors
     WHERE ingestion_run_id = $1
     ORDER BY activity`,
    [runId],
  );
  const factorMismatches = EXPECTED_EMISSION_FACTORS.filter((expected) => {
    const actual = factors.rows.find((row) => row.activity === expected.activity);
    if (!actual) {
      return true;
    }
    return (
      actual.scope !== expected.scope ||
      actual.unit !== expected.unit ||
      actual.kg_co2e_per_unit !== expected.kgCo2ePerUnit ||
      actual.factor_source !== expected.factorSource
    );
  });
  checks.push(
    factorMismatches.length === 0 && factors.rows.length === EXPECTED_COUNTS.emissionFactors
      ? pass("emission factors match supplied CSV", `${factors.rows.length} rows verified`)
      : fail(
          "emission factors match supplied CSV",
          factorMismatches.length > 0
            ? `mismatched activities: ${factorMismatches.map((row) => row.activity).join(", ")}`
            : `expected ${EXPECTED_COUNTS.emissionFactors} rows, got ${factors.rows.length}`,
        ),
  );

  // Older completed runs are valid historical records under versioned ingestion.
  // Only orphan rows (no run) or non-completed runs are invalid.
  const orphanRows = await query<{ table_name: string; count: string }>(
    `SELECT 'fuel_deliveries' AS table_name, COUNT(*)::text AS count
     FROM fuel_deliveries fd
     LEFT JOIN ingestion_runs ir ON ir.id = fd.ingestion_run_id
     WHERE ir.id IS NULL OR ir.status IS DISTINCT FROM 'completed'
     UNION ALL
     SELECT 'electricity_readings', COUNT(*)::text
     FROM electricity_readings er
     LEFT JOIN ingestion_runs ir ON ir.id = er.ingestion_run_id
     WHERE ir.id IS NULL OR ir.status IS DISTINCT FROM 'completed'
     UNION ALL
     SELECT 'incidents', COUNT(*)::text
     FROM incidents i
     LEFT JOIN ingestion_runs ir ON ir.id = i.ingestion_run_id
     WHERE ir.id IS NULL OR ir.status IS DISTINCT FROM 'completed'
     UNION ALL
     SELECT 'suppliers', COUNT(*)::text
     FROM suppliers s
     LEFT JOIN ingestion_runs ir ON ir.id = s.ingestion_run_id
     WHERE ir.id IS NULL OR ir.status IS DISTINCT FROM 'completed'
     UNION ALL
     SELECT 'emission_factors', COUNT(*)::text
     FROM emission_factors ef
     LEFT JOIN ingestion_runs ir ON ir.id = ef.ingestion_run_id
     WHERE ir.id IS NULL OR ir.status IS DISTINCT FROM 'completed'`,
  );
  const orphanTotal = orphanRows.rows.reduce((sum, row) => sum + Number(row.count), 0);
  checks.push(
    orphanTotal === 0
      ? pass(
          "no orphan or partial-run entity rows",
          "all entity rows belong to valid completed ingestion runs",
        )
      : fail(
          "no orphan or partial-run entity rows",
          orphanRows.rows
            .filter((row) => Number(row.count) > 0)
            .map((row) => `${row.table_name}=${row.count}`)
            .join(", "),
        ),
  );

  return checks;
}

function assertQualityIssueCounts(
  issueSummary: Array<{ action: string; issue_code: string; count: string }>,
): CheckResult {
  const actualByKey = new Map(
    issueSummary.map((row) => [`${row.action}|${row.issue_code}`, Number(row.count)]),
  );
  const mismatches: string[] = [];

  for (const expected of EXPECTED_QUALITY_ISSUE_COUNTS) {
    const key = `${expected.action}|${expected.issueCode}`;
    const actual = actualByKey.get(key);
    if (actual === undefined) {
      mismatches.push(`${expected.action}/${expected.issueCode}: missing (expected ${expected.count})`);
    } else if (actual !== expected.count) {
      mismatches.push(
        `${expected.action}/${expected.issueCode}: expected ${expected.count}, got ${actual}`,
      );
    }
  }

  if (mismatches.length === 0) {
    return pass(
      "quality issue counts by action and issue_code",
      `${EXPECTED_QUALITY_ISSUE_COUNTS.length} expected groups matched`,
    );
  }

  return fail(
    "quality issue counts by action and issue_code",
    mismatches.join("; "),
  );
}

export async function verifyIngestion(): Promise<{
  runId: string;
  checks: CheckResult[];
  issueSummary: Array<{ action: string; issue_code: string; count: string }>;
}> {
  const runId = await getLatestCompletedRunId();
  const checks = await runChecks(runId);

  const issueSummary = await query<{ action: string; issue_code: string; count: string }>(
    `SELECT action::text, issue_code, COUNT(*)::text AS count
     FROM data_quality_issues
     WHERE ingestion_run_id = $1
     GROUP BY action, issue_code
     ORDER BY action, issue_code`,
    [runId],
  );

  checks.push(assertQualityIssueCounts(issueSummary.rows));

  return { runId, checks, issueSummary: issueSummary.rows };
}

async function main(): Promise<void> {
  try {
    const { runId, checks, issueSummary } = await verifyIngestion();
    const failures = checks.filter((check) => !check.passed);

    console.log(`Verification target: latest completed ingestion run ${runId}`);
    console.log("");
    console.log("Checks:");
    for (const check of checks) {
      console.log(`${check.passed ? "PASS" : "FAIL"}  ${check.name}: ${check.detail}`);
    }

    console.log("");
    console.log("Quality issues by action and issue_code:");
    if (issueSummary.length === 0) {
      console.log("(none)");
    } else {
      for (const row of issueSummary) {
        console.log(`  ${row.action}\t${row.issue_code}\t${row.count}`);
      }
    }

    if (failures.length > 0) {
      console.error("");
      console.error(`Verification failed: ${failures.length} check(s) did not pass.`);
      process.exitCode = 1;
    } else {
      console.log("");
      console.log("All verification checks passed.");
    }
  } finally {
    await closePool();
  }
}

if (import.meta.url === new URL(process.argv[1] ?? "", "file:").href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
