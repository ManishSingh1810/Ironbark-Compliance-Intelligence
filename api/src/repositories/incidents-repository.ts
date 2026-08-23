import { query } from "../db/client.js";

export interface IncidentRow {
  id: string;
  source_incident_id: string;
  incident_date: Date;
  location: string;
  type_code: string;
  severity_raw: string;
  severity_normalised: number | null;
  severity_label: string | null;
  description: string;
  source_filename: string;
  source_row: number;
}

export interface CountRow {
  key: string;
  count: string;
}

export async function countIncidents(runId: string): Promise<number> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM incidents WHERE ingestion_run_id = $1`,
    [runId],
  );
  return Number(result.rows[0]?.count ?? 0);
}

export async function countIncidentsBySeverity(runId: string): Promise<CountRow[]> {
  const result = await query<CountRow>(
    `SELECT COALESCE(severity_label, 'Unknown') AS key, COUNT(*)::text AS count
     FROM incidents
     WHERE ingestion_run_id = $1
     GROUP BY severity_label, severity_normalised
     ORDER BY severity_normalised NULLS LAST, severity_label`,
    [runId],
  );
  return result.rows;
}

export async function countIncidentsByType(runId: string): Promise<CountRow[]> {
  const result = await query<CountRow>(
    `SELECT type_code AS key, COUNT(*)::text AS count
     FROM incidents
     WHERE ingestion_run_id = $1
     GROUP BY type_code
     ORDER BY type_code`,
    [runId],
  );
  return result.rows;
}

export async function countIncidentsByMonth(runId: string): Promise<CountRow[]> {
  const result = await query<CountRow>(
    `SELECT to_char(incident_date, 'YYYY-MM') AS key, COUNT(*)::text AS count
     FROM incidents
     WHERE ingestion_run_id = $1
     GROUP BY 1
     ORDER BY 1`,
    [runId],
  );
  return result.rows;
}

export async function listIncidents(
  runId: string,
  filters: { severityNormalised?: number; typeCode?: string },
): Promise<IncidentRow[]> {
  const clauses = ["ingestion_run_id = $1"];
  const params: unknown[] = [runId];

  if (filters.severityNormalised !== undefined) {
    params.push(filters.severityNormalised);
    clauses.push(`severity_normalised = $${params.length}`);
  }
  if (filters.typeCode !== undefined) {
    params.push(filters.typeCode);
    clauses.push(`type_code = $${params.length}`);
  }

  const result = await query<IncidentRow>(
    `SELECT id, source_incident_id, incident_date, location, type_code,
            severity_raw, severity_normalised, severity_label, description,
            source_filename, source_row
     FROM incidents
     WHERE ${clauses.join(" AND ")}
     ORDER BY incident_date, source_row`,
    params,
  );
  return result.rows;
}
