import { z } from "zod";

import {
  ISSUE_CODES,
  LARGE_DELIVERY_LITRES,
} from "../../domain/constants.js";
import { parseFlexibleDate } from "../normalize/dates.js";
import { parseCurrency } from "../normalize/currency.js";
import { quantityToLitres } from "../normalize/units.js";
import {
  findExactDuplicateSourceRows,
  isExactDuplicate,
  canonicalSourceRow,
} from "../quality/duplicates.js";
import { buildFileHeaderTrimIssues, monthOnlyDateIssue } from "../quality/issues.js";
import type { ParseResult, QualityIssueDraft } from "../types.js";
import { readCsvWithPhysicalRows } from "../csv-reader.js";

export const fuelRowSchema = z.object({
  "Invoice No": z.string().min(1),
  "Delivery Date": z.string().min(1),
  "Fuel Type": z.string().min(1),
  Quantity: z.string().min(1),
  Unit: z.string().min(1),
  "Cost (AUD)": z.string().min(1),
  "Site Area": z.string().min(1),
});

export const FUEL_COLUMNS = [
  "Invoice No",
  "Delivery Date",
  "Fuel Type",
  "Quantity",
  "Unit",
  "Cost (AUD)",
  "Site Area",
] as const;

export interface ParsedFuelRow {
  sourceRow: number;
  invoiceNoRaw: string;
  deliveryDateRaw: string;
  fuelTypeRaw: string;
  quantityRaw: string;
  unitRaw: string;
  costAudRaw: string;
  siteAreaRaw: string;
  invoiceNo: string;
  deliveryDate: string | null;
  reportingMonth: string | null;
  datePrecision: "day" | "month" | null;
  fuelType: string;
  quantityLitres: number;
  costAud: number;
  siteArea: string;
  includeInEmissions: boolean;
  issues: QualityIssueDraft[];
}

export function parseFuelCsv(content: string, sourceFilename: string): ParseResult<ParsedFuelRow> {
  const { rawHeaders, headers, rows } = readCsvWithPhysicalRows(content);
  const headerIssues = buildFileHeaderTrimIssues(
    rawHeaders,
    headers,
    "fuel_deliveries",
    sourceFilename,
  );
  const firstSeen = findExactDuplicateSourceRows(rows, [...FUEL_COLUMNS]);
  const parsedRows: ParsedFuelRow[] = [];

  for (const row of rows) {
    const validated = fuelRowSchema.parse(row.cells);
    const issues: QualityIssueDraft[] = [];
    const entityIdPlaceholder = null;

    for (const [field, rawValue] of Object.entries(row.rawCellsByHeader)) {
      const trimmed = row.cells[field];
      if (rawValue !== trimmed) {
        issues.push({
          entityTable: "fuel_deliveries",
          entityId: entityIdPlaceholder,
          sourceFilename,
          sourceRow: row.sourceRow,
          fieldName: field,
          originalValue: rawValue,
          cleanedValue: trimmed ?? "",
          action: "fixed",
          issueCode: "HEADER_OR_VALUE_TRIM",
          explanation: "Leading or trailing whitespace removed during normalisation.",
        });
      }
    }

    const date = parseFlexibleDate(validated["Delivery Date"]);
    if (date.isMonthOnly && date.reportingMonth) {
      issues.push(
        monthOnlyDateIssue(
          sourceFilename,
          row.sourceRow,
          "fuel_deliveries",
          entityIdPlaceholder,
          validated["Delivery Date"],
          date.reportingMonth,
        ),
      );
    }

    const quantityLitres = quantityToLitres(validated.Quantity, validated.Unit);
    const costAud = parseCurrency(validated["Cost (AUD)"]);

    if (quantityLitres < 0 || costAud < 0) {
      issues.push({
        entityTable: "fuel_deliveries",
        entityId: entityIdPlaceholder,
        sourceFilename,
        sourceRow: row.sourceRow,
        fieldName: "quantity_litres",
        originalValue: `${validated.Quantity} ${validated.Unit} / ${validated["Cost (AUD)"]}`,
        cleanedValue: `${quantityLitres} / ${costAud}`,
        action: "flagged",
        issueCode: ISSUE_CODES.CREDIT_REVERSAL,
        explanation:
          "Negative quantity or cost preserved as a possible credit/reversal; values not altered.",
      });
    }

    const duplicate = isExactDuplicate(row, [...FUEL_COLUMNS], firstSeen);
    const includeInEmissions = !duplicate;
    if (duplicate) {
      const canonicalRow = canonicalSourceRow(row, [...FUEL_COLUMNS], firstSeen);
      issues.push({
        entityTable: "fuel_deliveries",
        entityId: entityIdPlaceholder,
        sourceFilename,
        sourceRow: row.sourceRow,
        fieldName: null,
        originalValue: FUEL_COLUMNS.map((c) => row.rawCellsByHeader[c] ?? "").join("|"),
        cleanedValue: null,
        action: "rejected",
        issueCode: ISSUE_CODES.EXACT_DUPLICATE,
        explanation: `Exact duplicate of source row ${canonicalRow}; preserved but excluded from emissions calculations.`,
      });
    }

    if (quantityLitres > LARGE_DELIVERY_LITRES) {
      issues.push({
        entityTable: "fuel_deliveries",
        entityId: entityIdPlaceholder,
        sourceFilename,
        sourceRow: row.sourceRow,
        fieldName: "quantity_litres",
        originalValue: String(quantityLitres),
        cleanedValue: String(quantityLitres),
        action: "flagged",
        issueCode: ISSUE_CODES.LARGE_DELIVERY,
        explanation: "Delivery exceeds 100,000 L; unusual but retained for review.",
      });
    }

    parsedRows.push({
      sourceRow: row.sourceRow,
      invoiceNoRaw: row.rawCellsByHeader["Invoice No"] ?? validated["Invoice No"],
      deliveryDateRaw: row.rawCellsByHeader["Delivery Date"] ?? validated["Delivery Date"],
      fuelTypeRaw: row.rawCellsByHeader["Fuel Type"] ?? validated["Fuel Type"],
      quantityRaw: row.rawCellsByHeader.Quantity ?? validated.Quantity,
      unitRaw: row.rawCellsByHeader.Unit ?? validated.Unit,
      costAudRaw: row.rawCellsByHeader["Cost (AUD)"] ?? validated["Cost (AUD)"],
      siteAreaRaw: row.rawCellsByHeader["Site Area"] ?? validated["Site Area"],
      invoiceNo: validated["Invoice No"],
      deliveryDate: date.deliveryDate,
      reportingMonth: date.reportingMonth,
      datePrecision: date.datePrecision,
      fuelType: validated["Fuel Type"],
      quantityLitres,
      costAud,
      siteArea: validated["Site Area"],
      includeInEmissions,
      issues,
    });
  }

  return { rows: parsedRows, headerIssues };
}

export function fuelMonthsPresent(rows: ParsedFuelRow[]): Set<string> {
  const months = new Set<string>();
  for (const row of rows) {
    if (!row.includeInEmissions) {
      continue;
    }
    const month =
      row.reportingMonth?.slice(0, 7) ??
      row.deliveryDate?.slice(0, 7);
    if (month) {
      months.add(month);
    }
  }
  return months;
}

export function buildFuelMonthGapIssue(
  sourceFilename: string,
  missingMonth: string,
): QualityIssueDraft {
  return {
    entityTable: "fuel_deliveries",
    entityId: null,
    sourceFilename,
    sourceRow: null,
    fieldName: "reporting_month",
    originalValue: missingMonth,
    cleanedValue: null,
    action: "flagged",
    issueCode: ISSUE_CODES.FUEL_MONTH_GAP,
    explanation: `No fuel deliveries recorded for ${missingMonth}; gap flagged without imputation.`,
  };
}
