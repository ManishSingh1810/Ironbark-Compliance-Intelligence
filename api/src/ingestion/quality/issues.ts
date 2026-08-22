import { ISSUE_CODES } from "../../domain/constants.js";
import type { QualityIssueDraft } from "../types.js";

export function createQualityIssue(
  partial: QualityIssueDraft,
): QualityIssueDraft {
  return partial;
}

export function headerWhitespaceFixedIssue(
  sourceFilename: string,
  sourceRow: number,
  fieldName: string,
  originalValue: string,
  cleanedValue: string,
  entityTable: string,
  entityId: string | null,
): QualityIssueDraft {
  return createQualityIssue({
    entityTable,
    entityId,
    sourceFilename,
    sourceRow,
    fieldName,
    originalValue,
    cleanedValue,
    action: "fixed",
    issueCode: "HEADER_OR_VALUE_TRIM",
    explanation: "Leading or trailing whitespace removed during normalisation.",
  });
}

export function monthOnlyDateIssue(
  sourceFilename: string,
  sourceRow: number,
  entityTable: string,
  entityId: string | null,
  originalValue: string,
  reportingMonth: string,
): QualityIssueDraft {
  return createQualityIssue({
    entityTable,
    entityId,
    sourceFilename,
    sourceRow,
    fieldName: "delivery_date",
    originalValue,
    cleanedValue: reportingMonth,
    action: "flagged",
    issueCode: ISSUE_CODES.MONTH_ONLY_DATE,
    explanation:
      "Month-only date (Mon-YY); delivery_date left null and reporting_month used as anchor only.",
  });
}

export function buildFileHeaderTrimIssues(
  rawHeaders: string[],
  headers: string[],
  entityTable: string,
  sourceFilename: string,
): QualityIssueDraft[] {
  const issues: QualityIssueDraft[] = [];

  for (let index = 0; index < headers.length; index++) {
    const originalValue = rawHeaders[index] ?? "";
    const cleanedValue = headers[index] ?? "";
    if (originalValue === cleanedValue) {
      continue;
    }

    issues.push(
      createQualityIssue({
        entityTable,
        entityId: null,
        sourceFilename,
        sourceRow: null,
        fieldName: cleanedValue,
        originalValue,
        cleanedValue,
        action: "fixed",
        issueCode: trimIssueCode,
        explanation: "Header whitespace was removed deterministically.",
      }),
    );
  }

  return issues;
}

export const trimIssueCode = "HEADER_OR_VALUE_TRIM";
