import type { EntityTable } from "../domain/constants.js";
import { AppError } from "../errors.js";
import { findLatestCompletedRunId } from "../repositories/ingestion-run-repository.js";
import { listQualityIssuesForEntity } from "../repositories/data-quality-repository.js";
import { findEvidenceRecord } from "../repositories/evidence-repository.js";

export async function getEvidence(entityTable: EntityTable, entityId: string) {
  const ingestionRunId = await findLatestCompletedRunId();
  const record = await findEvidenceRecord(ingestionRunId, entityTable, entityId);
  if (!record) {
    throw new AppError(
      404,
      "EVIDENCE_NOT_FOUND",
      `No ${entityTable} record found for id ${entityId} in the latest completed ingestion run.`,
    );
  }

  const issues = await listQualityIssuesForEntity(ingestionRunId, entityTable, entityId);

  return {
    ingestionRunId,
    entityTable,
    entityId,
    sourceFilename: record.source_filename,
    sourceRow: record.source_row,
    record,
    qualityIssues: issues.map((row) => ({
      id: row.id,
      action: row.action,
      issueCode: row.issue_code,
      explanation: row.explanation,
      originalValue: row.original_value,
      cleanedValue: row.cleaned_value,
      sourceFilename: row.source_filename,
      sourceRow: row.source_row,
      createdAt: row.created_at.toISOString(),
    })),
  };
}
