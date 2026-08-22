import { z } from "zod";

import { ISSUE_CODES } from "../../domain/constants.js";
import { parseIncidentDate } from "../normalize/dates.js";
import { normaliseSeverity } from "../normalize/severity.js";
import type { ParseResult, QualityIssueDraft } from "../types.js";
import { readCsvWithPhysicalRows } from "../csv-reader.js";
import { buildFileHeaderTrimIssues } from "../quality/issues.js";

export const incidentRowSchema = z.object({
  incident_id: z.string().min(1),
  incident_date: z.string().min(1),
  location: z.string().min(1),
  type_code: z.string().min(1),
  severity: z.string().min(1),
  description: z.string().min(1),
});

export interface ParsedIncidentRow {
  sourceRow: number;
  sourceIncidentIdRaw: string;
  incidentDateRaw: string;
  locationRaw: string;
  typeCodeRaw: string;
  severityRaw: string;
  descriptionRaw: string;
  sourceIncidentId: string;
  incidentDate: string;
  location: string;
  typeCode: string;
  severityNormalised: number;
  severityLabel: string;
  description: string;
  issues: QualityIssueDraft[];
}

export function parseIncidentsCsv(
  content: string,
  sourceFilename: string,
): ParseResult<ParsedIncidentRow> {
  const { rawHeaders, headers, rows } = readCsvWithPhysicalRows(content);
  const headerIssues = buildFileHeaderTrimIssues(
    rawHeaders,
    headers,
    "incidents",
    sourceFilename,
  );
  const seenSourceIds = new Map<string, number>();
  const parsedRows: ParsedIncidentRow[] = [];

  for (const row of rows) {
    const validated = incidentRowSchema.parse(row.cells);
    const issues: QualityIssueDraft[] = [];
    const severity = normaliseSeverity(validated.severity);

    const priorRow = seenSourceIds.get(validated.incident_id);
    if (priorRow !== undefined) {
      issues.push({
        entityTable: "incidents",
        entityId: null,
        sourceFilename,
        sourceRow: row.sourceRow,
        fieldName: "source_incident_id",
        originalValue: validated.incident_id,
        cleanedValue: validated.incident_id,
        action: "flagged",
        issueCode: ISSUE_CODES.DUPLICATE_SOURCE_IDENTIFIER,
        explanation: `Source incident_id reused (first seen at source_row ${priorRow}); both rows preserved under separate internal UUIDs.`,
      });
    } else {
      seenSourceIds.set(validated.incident_id, row.sourceRow);
    }

    parsedRows.push({
      sourceRow: row.sourceRow,
      sourceIncidentIdRaw: row.rawCellsByHeader.incident_id ?? validated.incident_id,
      incidentDateRaw: row.rawCellsByHeader.incident_date ?? validated.incident_date,
      locationRaw: row.rawCellsByHeader.location ?? validated.location,
      typeCodeRaw: row.rawCellsByHeader.type_code ?? validated.type_code,
      severityRaw: row.rawCellsByHeader.severity ?? validated.severity,
      descriptionRaw: row.rawCellsByHeader.description ?? validated.description,
      sourceIncidentId: validated.incident_id.trim(),
      incidentDate: parseIncidentDate(validated.incident_date),
      location: validated.location.trim(),
      typeCode: validated.type_code.trim(),
      severityNormalised: severity.severityNormalised,
      severityLabel: severity.severityLabel,
      description: validated.description.trim(),
      issues,
    });
  }

  return { rows: parsedRows, headerIssues };
}
