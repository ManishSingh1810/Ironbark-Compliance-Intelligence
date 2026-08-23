import type pg from "pg";

import { AI_FINDING_TYPES, type AiFindingType } from "../domain/constants.js";
import { query } from "../db/client.js";

export class IncompleteAnalysisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IncompleteAnalysisError";
  }
}

export interface IncidentForClassification {
  id: string;
  source_incident_id: string;
  severity_raw: string;
  severity_normalised: number | null;
  severity_label: string | null;
  type_code: string;
  description: string;
  source_filename: string;
  source_row: number;
}

export interface AiFindingInsert {
  incidentId: string;
  findingType: AiFindingType;
  safetyCategory: string | null;
  isPsychosocialHazard: boolean | null;
  severityInconsistent: boolean | null;
  evidenceExcerpt: string;
  explanation: string;
  confidence: number;
  model: string;
  promptVersion: string;
}

export interface AiFindingRow {
  id: string;
  incident_id: string;
  finding_type: AiFindingType;
  safety_category: string | null;
  is_psychosocial_hazard: boolean | null;
  severity_inconsistent: boolean | null;
  evidence_excerpt: string;
  explanation: string;
  confidence: string;
  model: string;
  prompt_version: string;
  requires_human_review: boolean;
  created_at: Date;
}

export async function listIncidentsForClassification(
  runId: string,
): Promise<IncidentForClassification[]> {
  const result = await query<IncidentForClassification>(
    `SELECT id, source_incident_id, severity_raw, severity_normalised, severity_label,
            type_code, description, source_filename, source_row
     FROM incidents
     WHERE ingestion_run_id = $1
     ORDER BY incident_date, source_row`,
    [runId],
  );
  return result.rows;
}

export async function countIncidentsInRun(runId: string): Promise<number> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM incidents WHERE ingestion_run_id = $1`,
    [runId],
  );
  return Number(result.rows[0]?.count ?? 0);
}

export async function hasCompleteAnalysis(
  incidentId: string,
  model: string,
  promptVersion: string,
): Promise<boolean> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(DISTINCT finding_type)::text AS count
     FROM ai_incident_analysis
     WHERE incident_id = $1 AND model = $2 AND prompt_version = $3`,
    [incidentId, model, promptVersion],
  );
  return Number(result.rows[0]?.count ?? 0) >= 3;
}

export async function assertCompleteAnalysis(
  client: pg.PoolClient,
  incidentId: string,
  model: string,
  promptVersion: string,
): Promise<void> {
  const result = await client.query<{ finding_types: string[] | null }>(
    `SELECT array_agg(DISTINCT finding_type::text ORDER BY finding_type::text) AS finding_types
     FROM ai_incident_analysis
     WHERE incident_id = $1 AND model = $2 AND prompt_version = $3`,
    [incidentId, model, promptVersion],
  );

  const findingTypes = result.rows[0]?.finding_types ?? [];
  const missingTypes = AI_FINDING_TYPES.filter((type) => !findingTypes.includes(type));

  if (missingTypes.length > 0) {
    throw new IncompleteAnalysisError(
      `Incomplete analysis for incident ${incidentId}: missing finding types ${missingTypes.join(", ")}.`,
    );
  }
}

export async function insertFindings(
  client: pg.PoolClient,
  findings: AiFindingInsert[],
): Promise<void> {
  if (findings.length === 0) {
    throw new IncompleteAnalysisError("No findings provided for insertion.");
  }

  const incidentId = findings[0]!.incidentId;
  const model = findings[0]!.model;
  const promptVersion = findings[0]!.promptVersion;

  for (const finding of findings) {
    await client.query(
      `INSERT INTO ai_incident_analysis (
         incident_id, finding_type, safety_category, is_psychosocial_hazard,
         severity_inconsistent, evidence_excerpt, explanation, confidence,
         model, prompt_version, requires_human_review
       ) VALUES ($1, $2::ai_finding_type, $3, $4, $5, $6, $7, $8, $9, $10, TRUE)
       ON CONFLICT (incident_id, finding_type, model, prompt_version)
       DO NOTHING`,
      [
        finding.incidentId,
        finding.findingType,
        finding.safetyCategory,
        finding.isPsychosocialHazard,
        finding.severityInconsistent,
        finding.evidenceExcerpt,
        finding.explanation,
        finding.confidence,
        finding.model,
        finding.promptVersion,
      ],
    );
  }

  await assertCompleteAnalysis(client, incidentId, model, promptVersion);
}

export async function listFindingsForRun(
  runId: string,
  model: string,
  promptVersion: string,
): Promise<AiFindingRow[]> {
  const result = await query<AiFindingRow>(
    `SELECT a.id, a.incident_id, a.finding_type, a.safety_category,
            a.is_psychosocial_hazard, a.severity_inconsistent, a.evidence_excerpt,
            a.explanation, a.confidence::text, a.model, a.prompt_version,
            a.requires_human_review, a.created_at
     FROM ai_incident_analysis a
     JOIN incidents i ON i.id = a.incident_id
     WHERE i.ingestion_run_id = $1
       AND a.model = $2
       AND a.prompt_version = $3`,
    [runId, model, promptVersion],
  );
  return result.rows;
}

export async function countAnalysedIncidents(
  runId: string,
  model: string,
  promptVersion: string,
): Promise<number> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM (
       SELECT a.incident_id
       FROM ai_incident_analysis a
       JOIN incidents i ON i.id = a.incident_id
       WHERE i.ingestion_run_id = $1
         AND a.model = $2
         AND a.prompt_version = $3
       GROUP BY a.incident_id
       HAVING COUNT(DISTINCT a.finding_type) = 3
     ) complete_incidents`,
    [runId, model, promptVersion],
  );
  return Number(result.rows[0]?.count ?? 0);
}

export async function listIncidentAnalysisStatus(
  runId: string,
  model: string,
  promptVersion: string,
): Promise<Map<string, "complete" | "partial" | "pending">> {
  const result = await query<{ incident_id: string; finding_count: string }>(
    `SELECT i.id AS incident_id,
            COUNT(DISTINCT a.finding_type)::text AS finding_count
     FROM incidents i
     LEFT JOIN ai_incident_analysis a
       ON a.incident_id = i.id
      AND a.model = $2
      AND a.prompt_version = $3
     WHERE i.ingestion_run_id = $1
     GROUP BY i.id`,
    [runId, model, promptVersion],
  );

  const statusByIncident = new Map<string, "complete" | "partial" | "pending">();
  for (const row of result.rows) {
    const count = Number(row.finding_count);
    if (count >= 3) {
      statusByIncident.set(row.incident_id, "complete");
    } else if (count > 0) {
      statusByIncident.set(row.incident_id, "partial");
    } else {
      statusByIncident.set(row.incident_id, "pending");
    }
  }
  return statusByIncident;
}
