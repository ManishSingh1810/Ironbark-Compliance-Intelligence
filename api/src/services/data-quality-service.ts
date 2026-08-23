import { findLatestCompletedRunId } from "../repositories/ingestion-run-repository.js";
import {
  countQualityIssues,
  countQualityIssuesByAction,
  countQualityIssuesByCode,
  countQualityIssuesBySource,
  listQualityIssues,
} from "../repositories/data-quality-repository.js";

export async function getDataQualitySummary() {
  const ingestionRunId = await findLatestCompletedRunId();
  const [total, byAction, byCode, bySource] = await Promise.all([
    countQualityIssues(ingestionRunId),
    countQualityIssuesByAction(ingestionRunId),
    countQualityIssuesByCode(ingestionRunId),
    countQualityIssuesBySource(ingestionRunId),
  ]);

  return {
    ingestionRunId,
    totalIssues: total,
    byAction: byAction.map((row) => ({
      action: row.key,
      count: Number(row.count),
    })),
    byIssueCode: byCode.map((row) => ({
      issueCode: row.key,
      count: Number(row.count),
    })),
    bySource: bySource.map((row) => {
      const [sourceFilename, entityTable] = row.key.split("|");
      return {
        sourceFilename: sourceFilename ?? "",
        entityTable: entityTable ?? "",
        count: Number(row.count),
      };
    }),
  };
}

export async function getDataQualityIssues(filters: {
  action?: string;
  issueCode?: string;
  sourceFilename?: string;
  entityTable?: string;
}) {
  const ingestionRunId = await findLatestCompletedRunId();
  const rows = await listQualityIssues(ingestionRunId, filters);

  return {
    ingestionRunId,
    count: rows.length,
    issues: rows.map((row) => ({
      id: row.id,
      action: row.action,
      issueCode: row.issue_code,
      explanation: row.explanation,
      originalValue: row.original_value,
      cleanedValue: row.cleaned_value,
      sourceFilename: row.source_filename,
      sourceRow: row.source_row,
      entityTable: row.entity_table,
      entityId: row.entity_id,
      createdAt: row.created_at.toISOString(),
    })),
  };
}
