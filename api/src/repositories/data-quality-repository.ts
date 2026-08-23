import { query } from "../db/client.js";

export interface QualityIssueRow {
  id: string;
  action: string;
  issue_code: string;
  explanation: string;
  original_value: string | null;
  cleaned_value: string | null;
  source_filename: string;
  source_row: number | null;
  entity_table: string;
  entity_id: string | null;
  created_at: Date;
}

export interface CountRow {
  key: string;
  count: string;
}

export async function countQualityIssues(runId: string): Promise<number> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM data_quality_issues
     WHERE ingestion_run_id = $1`,
    [runId],
  );
  return Number(result.rows[0]?.count ?? 0);
}

export async function countQualityIssuesByAction(runId: string): Promise<CountRow[]> {
  const result = await query<CountRow>(
    `SELECT action::text AS key, COUNT(*)::text AS count
     FROM data_quality_issues
     WHERE ingestion_run_id = $1
     GROUP BY action
     ORDER BY action`,
    [runId],
  );
  return result.rows;
}

export async function countQualityIssuesByCode(runId: string): Promise<CountRow[]> {
  const result = await query<CountRow>(
    `SELECT issue_code AS key, COUNT(*)::text AS count
     FROM data_quality_issues
     WHERE ingestion_run_id = $1
     GROUP BY issue_code
     ORDER BY issue_code`,
    [runId],
  );
  return result.rows;
}

export async function countQualityIssuesBySource(runId: string): Promise<CountRow[]> {
  const result = await query<CountRow>(
    `SELECT source_filename || '|' || entity_table AS key, COUNT(*)::text AS count
     FROM data_quality_issues
     WHERE ingestion_run_id = $1
     GROUP BY source_filename, entity_table
     ORDER BY source_filename, entity_table`,
    [runId],
  );
  return result.rows;
}

export async function listQualityIssues(
  runId: string,
  filters: {
    action?: string;
    issueCode?: string;
    sourceFilename?: string;
    entityTable?: string;
  },
): Promise<QualityIssueRow[]> {
  const clauses = ["ingestion_run_id = $1"];
  const params: unknown[] = [runId];

  if (filters.action) {
    params.push(filters.action);
    clauses.push(`action::text = $${params.length}`);
  }
  if (filters.issueCode) {
    params.push(filters.issueCode);
    clauses.push(`issue_code = $${params.length}`);
  }
  if (filters.sourceFilename) {
    params.push(filters.sourceFilename);
    clauses.push(`source_filename = $${params.length}`);
  }
  if (filters.entityTable) {
    params.push(filters.entityTable);
    clauses.push(`entity_table = $${params.length}`);
  }

  const result = await query<QualityIssueRow>(
    `SELECT id, action::text, issue_code, explanation,
            original_value, cleaned_value, source_filename, source_row,
            entity_table, entity_id, created_at
     FROM data_quality_issues
     WHERE ${clauses.join(" AND ")}
     ORDER BY created_at, id`,
    params,
  );
  return result.rows;
}

export async function listQualityIssuesForEntity(
  runId: string,
  entityTable: string,
  entityId: string,
): Promise<QualityIssueRow[]> {
  const result = await query<QualityIssueRow>(
    `SELECT id, action::text, issue_code, explanation,
            original_value, cleaned_value, source_filename, source_row,
            entity_table, entity_id, created_at
     FROM data_quality_issues
     WHERE ingestion_run_id = $1
       AND entity_table = $2
       AND entity_id = $3
     ORDER BY created_at, id`,
    [runId, entityTable, entityId],
  );
  return result.rows;
}
