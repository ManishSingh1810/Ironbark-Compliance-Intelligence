import { findLatestCompletedRunId } from "../repositories/ingestion-run-repository.js";
import {
  countIncidents,
  countIncidentsByMonth,
  countIncidentsBySeverity,
  countIncidentsByType,
  listIncidents,
} from "../repositories/incidents-repository.js";
import { getIncidentAiStatusMap } from "./ai-incidents-service.js";

function severityFilterToNormalised(severity?: string): number | undefined {
  if (!severity) {
    return undefined;
  }
  if (severity === "1" || severity === "Low") {
    return 1;
  }
  if (severity === "2" || severity === "Medium") {
    return 2;
  }
  if (severity === "3" || severity === "High") {
    return 3;
  }
  return undefined;
}

export async function getIncidentsSummary() {
  const ingestionRunId = await findLatestCompletedRunId();
  const [total, bySeverity, byType, byMonth] = await Promise.all([
    countIncidents(ingestionRunId),
    countIncidentsBySeverity(ingestionRunId),
    countIncidentsByType(ingestionRunId),
    countIncidentsByMonth(ingestionRunId),
  ]);

  return {
    ingestionRunId,
    totalIncidents: total,
    bySeverity: bySeverity.map((row) => ({
      severity: row.key,
      count: Number(row.count),
    })),
    byTypeCode: byType.map((row) => ({
      typeCode: row.key,
      count: Number(row.count),
    })),
    byMonth: byMonth.map((row) => ({
      month: row.key,
      count: Number(row.count),
    })),
    trends: {
      monthlyCounts: byMonth.map((row) => ({
        month: row.key,
        count: Number(row.count),
      })),
      severityCounts: bySeverity.map((row) => ({
        severity: row.key,
        count: Number(row.count),
      })),
    },
  };
}

export async function getIncidents(filters: { severity?: string; type?: string }) {
  const ingestionRunId = await findLatestCompletedRunId();
  const [rows, aiStatusByIncident] = await Promise.all([
    listIncidents(ingestionRunId, {
      severityNormalised: severityFilterToNormalised(filters.severity),
      typeCode: filters.type,
    }),
    getIncidentAiStatusMap(ingestionRunId),
  ]);

  return {
    ingestionRunId,
    count: rows.length,
    incidents: rows.map((row) => ({
      id: row.id,
      sourceIncidentId: row.source_incident_id,
      date: row.incident_date.toISOString().slice(0, 10),
      location: row.location,
      typeCode: row.type_code,
      severityRaw: row.severity_raw,
      severityNormalised: row.severity_normalised,
      severityLabel: row.severity_label,
      description: row.description,
      sourceFilename: row.source_filename,
      sourceRow: row.source_row,
      aiAnalysisStatus: aiStatusByIncident.get(row.id) ?? "pending",
    })),
  };
}
