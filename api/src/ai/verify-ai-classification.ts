import { PROMPT_VERSION } from "./config.js";
import { closePool, query } from "../db/client.js";
import { AI_FINDING_TYPES } from "../domain/constants.js";
import { findLatestCompletedRunId } from "../repositories/ingestion-run-repository.js";

interface CheckResult {
  name: string;
  passed: boolean;
  detail: string;
}

const EXPECTED_INCIDENT_COUNT = 42;
const REQUIRED_FINDING_TYPES = [...AI_FINDING_TYPES];

function pass(name: string, detail: string): CheckResult {
  return { name, passed: true, detail };
}

function fail(name: string, detail: string): CheckResult {
  return { name, passed: false, detail };
}

function resolveActiveModel(): string {
  const model = process.env.OPENAI_MODEL?.trim();
  if (!model) {
    throw new Error("OPENAI_MODEL is not set");
  }
  return model;
}

async function runChecks(
  runId: string,
  model: string,
  promptVersion: string,
): Promise<CheckResult[]> {
  const checks: CheckResult[] = [];

  const incidentCount = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM incidents WHERE ingestion_run_id = $1`,
    [runId],
  );
  const totalIncidents = Number(incidentCount.rows[0]?.count ?? 0);
  checks.push(
    totalIncidents === EXPECTED_INCIDENT_COUNT
      ? pass("incident count", `${totalIncidents} incidents in latest completed run`)
      : fail(
          "incident count",
          `expected ${EXPECTED_INCIDENT_COUNT}, found ${totalIncidents}`,
        ),
  );

  checks.push(
    promptVersion === "incident-classification-v3"
      ? pass("active prompt version", promptVersion)
      : fail("active prompt version", `expected incident-classification-v3, found ${promptVersion}`),
  );

  checks.push(
    model.length > 0
      ? pass("active model", model)
      : fail("active model", "OPENAI_MODEL is empty"),
  );

  const completeness = await query<{
    complete: number;
    partial: number;
    pending: number;
  }>(
    `SELECT
       COUNT(*) FILTER (WHERE finding_count = 3)::int AS complete,
       COUNT(*) FILTER (WHERE finding_count > 0 AND finding_count < 3)::int AS partial,
       COUNT(*) FILTER (WHERE finding_count = 0)::int AS pending
     FROM (
       SELECT i.id, COUNT(DISTINCT a.finding_type) AS finding_count
       FROM incidents i
       LEFT JOIN ai_incident_analysis a
         ON a.incident_id = i.id
        AND a.model = $2
        AND a.prompt_version = $3
       WHERE i.ingestion_run_id = $1
       GROUP BY i.id
     ) status_counts`,
    [runId, model, promptVersion],
  );

  const { complete, partial, pending } = completeness.rows[0] ?? {
    complete: 0,
    partial: 0,
    pending: 0,
  };

  checks.push(
    complete === EXPECTED_INCIDENT_COUNT
      ? pass("complete v3 analyses", `${complete}/${EXPECTED_INCIDENT_COUNT} incidents have 3 finding types`)
      : fail(
          "complete v3 analyses",
          `expected ${EXPECTED_INCIDENT_COUNT} complete, found ${complete}`,
        ),
  );

  checks.push(
    partial === 0
      ? pass("zero partial v3 analyses", "no partial analyses")
      : fail("zero partial v3 analyses", `${partial} partial analyses remain`),
  );

  checks.push(
    pending === 0
      ? pass("rerun completeness", "0 pending; a second classify run would skip all 42")
      : fail("rerun completeness", `${pending} incidents still pending for ${promptVersion}`),
  );

  const findingTypeCounts = await query<{ finding_type: string; count: number }>(
    `SELECT a.finding_type::text AS finding_type, COUNT(*)::int AS count
     FROM ai_incident_analysis a
     JOIN incidents i ON i.id = a.incident_id
     WHERE i.ingestion_run_id = $1
       AND a.model = $2
       AND a.prompt_version = $3
     GROUP BY a.finding_type
     ORDER BY a.finding_type`,
    [runId, model, promptVersion],
  );

  const countByType = new Map(
    findingTypeCounts.rows.map((row) => [row.finding_type, row.count]),
  );
  const missingOrWrong = REQUIRED_FINDING_TYPES.filter(
    (type) => countByType.get(type) !== EXPECTED_INCIDENT_COUNT,
  );
  checks.push(
    missingOrWrong.length === 0
      ? pass(
          "exactly 3 finding rows per incident",
          `each of ${REQUIRED_FINDING_TYPES.join(", ")} present ${EXPECTED_INCIDENT_COUNT} times (126 rows)`,
        )
      : fail(
          "exactly 3 finding rows per incident",
          `unexpected counts: ${REQUIRED_FINDING_TYPES.map(
            (type) => `${type}=${countByType.get(type) ?? 0}`,
          ).join(", ")}`,
        ),
  );

  const missingEvidence = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM ai_incident_analysis a
     JOIN incidents i ON i.id = a.incident_id
     WHERE i.ingestion_run_id = $1
       AND a.model = $2
       AND a.prompt_version = $3
       AND (a.evidence_excerpt IS NULL OR btrim(a.evidence_excerpt) = '')`,
    [runId, model, promptVersion],
  );
  const missingEvidenceCount = Number(missingEvidence.rows[0]?.count ?? 0);
  checks.push(
    missingEvidenceCount === 0
      ? pass("no missing evidence", "all evidence_excerpt values are non-empty")
      : fail("no missing evidence", `${missingEvidenceCount} rows missing evidence_excerpt`),
  );

  const ungrounded = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM ai_incident_analysis a
     JOIN incidents i ON i.id = a.incident_id
     WHERE i.ingestion_run_id = $1
       AND a.model = $2
       AND a.prompt_version = $3
       AND position(a.evidence_excerpt IN i.description) = 0`,
    [runId, model, promptVersion],
  );
  const ungroundedCount = Number(ungrounded.rows[0]?.count ?? 0);
  checks.push(
    ungroundedCount === 0
      ? pass(
          "evidence substrings",
          "every stored evidence_excerpt is a substring of the source description",
        )
      : fail(
          "evidence substrings",
          `${ungroundedCount} evidence excerpts are not substrings of the description`,
        ),
  );

  const traceability = await query<{
    missing_link: number;
    missing_source_id: number;
    missing_filename: number;
    missing_row: number;
  }>(
    `SELECT
       COUNT(*) FILTER (WHERE i.id IS NULL)::int AS missing_link,
       COUNT(*) FILTER (WHERE i.source_incident_id IS NULL OR btrim(i.source_incident_id) = '')::int AS missing_source_id,
       COUNT(*) FILTER (WHERE i.source_filename IS NULL OR btrim(i.source_filename) = '')::int AS missing_filename,
       COUNT(*) FILTER (WHERE i.source_row IS NULL)::int AS missing_row
     FROM ai_incident_analysis a
     LEFT JOIN incidents i ON i.id = a.incident_id
     WHERE a.model = $1
       AND a.prompt_version = $2
       AND (i.ingestion_run_id = $3 OR i.id IS NULL)`,
    [model, promptVersion, runId],
  );

  const trace = traceability.rows[0] ?? {
    missing_link: 0,
    missing_source_id: 0,
    missing_filename: 0,
    missing_row: 0,
  };
  const traceOk =
    trace.missing_link === 0 &&
    trace.missing_source_id === 0 &&
    trace.missing_filename === 0 &&
    trace.missing_row === 0;
  checks.push(
    traceOk
      ? pass(
          "source traceability",
          "every v3 finding links to internal UUID, source_incident_id, source_filename, and source_row",
        )
      : fail(
          "source traceability",
          `missing_link=${trace.missing_link}, missing_source_id=${trace.missing_source_id}, missing_filename=${trace.missing_filename}, missing_row=${trace.missing_row}`,
        ),
  );

  const reviewRequired = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM ai_incident_analysis a
     JOIN incidents i ON i.id = a.incident_id
     WHERE i.ingestion_run_id = $1
       AND a.model = $2
       AND a.prompt_version = $3
       AND a.requires_human_review IS NOT TRUE`,
    [runId, model, promptVersion],
  );
  const notReviewable = Number(reviewRequired.rows[0]?.count ?? 0);
  checks.push(
    notReviewable === 0
      ? pass("requires human review", "all v3 findings have requires_human_review = true")
      : fail("requires human review", `${notReviewable} findings lack requires_human_review`),
  );

  return checks;
}

export async function verifyAiClassification(): Promise<{
  runId: string;
  model: string;
  promptVersion: string;
  checks: CheckResult[];
}> {
  const runId = await findLatestCompletedRunId();
  const model = resolveActiveModel();
  const promptVersion = PROMPT_VERSION;
  const checks = await runChecks(runId, model, promptVersion);
  return { runId, model, promptVersion, checks };
}

async function main(): Promise<void> {
  try {
    const { runId, model, promptVersion, checks } = await verifyAiClassification();
    const failures = checks.filter((check) => !check.passed);

    console.log(`AI verification target: latest completed ingestion run ${runId}`);
    console.log(`Active model: ${model}`);
    console.log(`Active prompt version: ${promptVersion}`);
    console.log("");
    console.log("Checks:");
    for (const check of checks) {
      console.log(`${check.passed ? "PASS" : "FAIL"}  ${check.name}: ${check.detail}`);
    }

    if (failures.length > 0) {
      console.error("");
      console.error(`AI verification failed: ${failures.length} check(s) did not pass.`);
      process.exitCode = 1;
    } else {
      console.log("");
      console.log("All AI verification checks passed.");
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
