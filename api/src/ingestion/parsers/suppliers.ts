import { z } from "zod";

import { ISSUE_CODES } from "../../domain/constants.js";
import { parseCurrency } from "../normalize/currency.js";
import {
  isValidAbnLength,
  normaliseAbnDigits,
  normaliseSupplierName,
} from "../normalize/suppliers.js";
import type { ParseResult, QualityIssueDraft } from "../types.js";
import { readCsvWithPhysicalRows } from "../csv-reader.js";
import { buildFileHeaderTrimIssues } from "../quality/issues.js";

export const supplierRowSchema = z.object({
  supplier_name: z.string().min(1),
  abn: z.string().optional().default(""),
  category: z.string().min(1),
  fy_spend_aud: z.string().min(1),
});

export interface ParsedSupplierRow {
  sourceRow: number;
  supplierNameRaw: string;
  abnRaw: string | null;
  categoryRaw: string;
  fySpendAudRaw: string;
  supplierName: string;
  abn: string | null;
  abnDigits: string;
  abnValid: boolean | null;
  category: string;
  fySpendAud: number;
  issues: QualityIssueDraft[];
}

export function parseSuppliersCsv(
  content: string,
  sourceFilename: string,
): ParseResult<ParsedSupplierRow> {
  const { rawHeaders, headers, rows } = readCsvWithPhysicalRows(content);
  const headerIssues = buildFileHeaderTrimIssues(
    rawHeaders,
    headers,
    "suppliers",
    sourceFilename,
  );
  const parsedRows: ParsedSupplierRow[] = [];

  for (const row of rows) {
    const validated = supplierRowSchema.parse({
      ...row.cells,
      abn: row.cells.abn ?? "",
    });
    const issues: QualityIssueDraft[] = [];

    const abnRaw = row.rawCellsByHeader.abn ?? validated.abn ?? "";
    const abnDigits = normaliseAbnDigits(abnRaw);
    const abnDisplay = abnRaw.trim() || null;

    if (!abnDigits) {
      issues.push({
        entityTable: "suppliers",
        entityId: null,
        sourceFilename,
        sourceRow: row.sourceRow,
        fieldName: "abn",
        originalValue: abnRaw,
        cleanedValue: null,
        action: "flagged",
        issueCode: ISSUE_CODES.MISSING_ABN,
        explanation: "Supplier ABN is missing; row ingested and flagged.",
      });
    } else if (!isValidAbnLength(abnDigits)) {
      issues.push({
        entityTable: "suppliers",
        entityId: null,
        sourceFilename,
        sourceRow: row.sourceRow,
        fieldName: "abn",
        originalValue: abnRaw,
        cleanedValue: abnDigits,
        action: "flagged",
        issueCode: ISSUE_CODES.INVALID_ABN,
        explanation: "ABN does not contain exactly 11 digits; not treated as full legal validation.",
      });
    }

    parsedRows.push({
      sourceRow: row.sourceRow,
      supplierNameRaw: row.rawCellsByHeader.supplier_name ?? validated.supplier_name,
      abnRaw: abnRaw || null,
      categoryRaw: row.rawCellsByHeader.category ?? validated.category,
      fySpendAudRaw: row.rawCellsByHeader.fy_spend_aud ?? validated.fy_spend_aud,
      supplierName: normaliseSupplierName(validated.supplier_name),
      abn: abnDisplay,
      abnDigits: abnDigits || "",
      abnValid: abnDigits ? isValidAbnLength(abnDigits) : null,
      category: validated.category.trim(),
      fySpendAud: parseCurrency(validated.fy_spend_aud),
      issues,
    });
  }

  const withDuplicateFlags = appendSupplierDuplicateFlags(parsedRows, sourceFilename);
  return { rows: withDuplicateFlags, headerIssues };
}

function appendSupplierDuplicateFlags(
  rows: ParsedSupplierRow[],
  sourceFilename: string,
): ParsedSupplierRow[] {
  const byAbn = new Map<string, ParsedSupplierRow[]>();
  const byNormalisedName = new Map<string, ParsedSupplierRow[]>();

  for (const row of rows) {
    if (row.abnDigits) {
      const group = byAbn.get(row.abnDigits) ?? [];
      group.push(row);
      byAbn.set(row.abnDigits, group);
    }
    const nameKey = row.supplierName.toLowerCase();
    const nameGroup = byNormalisedName.get(nameKey) ?? [];
    nameGroup.push(row);
    byNormalisedName.set(nameKey, nameGroup);
  }

  for (const row of rows) {
    if (row.abnDigits) {
      const abnGroup = byAbn.get(row.abnDigits) ?? [];
      const distinctNames = new Set(abnGroup.map((entry) => entry.supplierName));
      if (distinctNames.size > 1) {
        row.issues.push({
          entityTable: "suppliers",
          entityId: null,
          sourceFilename,
          sourceRow: row.sourceRow,
          fieldName: "supplier_name",
          originalValue: row.supplierNameRaw,
          cleanedValue: row.supplierName,
          action: "flagged",
          issueCode: ISSUE_CODES.DUPLICATE_SUPPLIER_ENTITY,
          explanation:
            "Multiple supplier names share the same ABN; flagged as likely duplicate entity without automatic merge.",
        });
      }
    }

    const likelyIronline =
      row.supplierName.toLowerCase().includes("ironline fuel") &&
      rows.some(
        (other) =>
          other.sourceRow !== row.sourceRow &&
          other.supplierName.toLowerCase().includes("ironline fuel") &&
          ((!row.abnDigits && other.abnDigits) || (!other.abnDigits && row.abnDigits)),
      );
    if (likelyIronline) {
      row.issues.push({
        entityTable: "suppliers",
        entityId: null,
        sourceFilename,
        sourceRow: row.sourceRow,
        fieldName: "supplier_name",
        originalValue: row.supplierNameRaw,
        cleanedValue: row.supplierName,
        action: "flagged",
        issueCode: ISSUE_CODES.DUPLICATE_SUPPLIER_ENTITY,
        explanation:
          "Likely duplicate Ironline Fuel entity with inconsistent ABN presence; flagged for review.",
      });
    }
  }

  return rows;
}
