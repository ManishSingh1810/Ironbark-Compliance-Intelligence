import { z } from "zod";

import {
  ISSUE_CODES,
  MTR07_SCALE_SHIFT_FROM,
  SITE_DROP_COMPARE_FROM,
  SITE_DROP_COMPARE_TO,
} from "../../domain/constants.js";
import { parsePeriodMonth } from "../normalize/dates.js";
import { parseConsumptionKwh } from "../normalize/units.js";
import type { ParseResult, QualityIssueDraft } from "../types.js";
import { readCsvWithPhysicalRows } from "../csv-reader.js";
import { buildFileHeaderTrimIssues } from "../quality/issues.js";

export const electricityRowSchema = z.object({
  meter_id: z.string().min(1),
  meter_description: z.string().min(1),
  period: z.string().min(1),
  consumption: z.string().min(1),
  unit: z.string().min(1),
});

export interface ParsedElectricityRow {
  sourceRow: number;
  meterIdRaw: string;
  meterDescriptionRaw: string;
  periodRaw: string;
  consumptionRaw: string;
  unitRaw: string;
  meterId: string;
  meterDescription: string;
  periodMonth: string;
  consumptionKwh: number;
  includeInEmissions: boolean;
  issues: QualityIssueDraft[];
}

export function parseElectricityCsv(
  content: string,
  sourceFilename: string,
): ParseResult<ParsedElectricityRow> {
  const { rawHeaders, headers, rows } = readCsvWithPhysicalRows(content);
  const headerIssues = buildFileHeaderTrimIssues(
    rawHeaders,
    headers,
    "electricity_readings",
    sourceFilename,
  );
  const parsedRows: ParsedElectricityRow[] = [];

  for (const row of rows) {
    const validated = electricityRowSchema.parse(row.cells);
    const issues: QualityIssueDraft[] = [];

    const periodMonth = parsePeriodMonth(validated.period);
    const consumptionKwh = parseConsumptionKwh(validated.consumption);

    if (
      validated.meter_id === "MTR-07" &&
      validated.period >= MTR07_SCALE_SHIFT_FROM &&
      consumptionKwh < 1000
    ) {
      issues.push({
        entityTable: "electricity_readings",
        entityId: null,
        sourceFilename,
        sourceRow: row.sourceRow,
        fieldName: "consumption_kwh",
        originalValue: validated.consumption,
        cleanedValue: String(consumptionKwh),
        action: "flagged",
        issueCode: ISSUE_CODES.MTR07_SCALE_SHIFT,
        explanation:
          "MTR-07 consumption dropped ~1000× from Oct 2025; value retained unchanged for Scope 2 totals.",
      });
    }

    parsedRows.push({
      sourceRow: row.sourceRow,
      meterIdRaw: row.rawCellsByHeader.meter_id ?? validated.meter_id,
      meterDescriptionRaw:
        row.rawCellsByHeader.meter_description ?? validated.meter_description,
      periodRaw: row.rawCellsByHeader.period ?? validated.period,
      consumptionRaw: row.rawCellsByHeader.consumption ?? validated.consumption,
      unitRaw: row.rawCellsByHeader.unit ?? validated.unit,
      meterId: validated.meter_id.trim(),
      meterDescription: validated.meter_description.trim(),
      periodMonth,
      consumptionKwh,
      includeInEmissions: true,
      issues,
    });
  }

  return { rows: parsedRows, headerIssues };
}

export function buildMissingMeterIssue(sourceFilename: string): QualityIssueDraft {
  return {
    entityTable: "electricity_readings",
    entityId: null,
    sourceFilename,
    sourceRow: null,
    fieldName: "meter_id",
    originalValue: "MTR-06",
    cleanedValue: null,
    action: "flagged",
    issueCode: ISSUE_CODES.MISSING_METER,
    explanation: "Meter MTR-06 is absent from the sequence; flagged without inventing a meter.",
  };
}

export function buildSiteElectricityDropIssue(
  sourceFilename: string,
  fromMonth: string,
  toMonth: string,
  fromTotal: number,
  toTotal: number,
): QualityIssueDraft {
  const changePct = ((toTotal - fromTotal) / fromTotal) * 100;
  return {
    entityTable: "electricity_readings",
    entityId: null,
    sourceFilename,
    sourceRow: null,
    fieldName: "period_month",
    originalValue: `${fromMonth}:${fromTotal.toFixed(1)} -> ${toMonth}:${toTotal.toFixed(1)}`,
    cleanedValue: `${changePct.toFixed(2)}%`,
    action: "flagged",
    issueCode: ISSUE_CODES.SITE_ELECTRICITY_DROP,
    explanation:
      "Site-wide electricity total dropped sharply between Feb and Mar 2026; flagged as period-level anomaly without correcting readings.",
  };
}

export function siteTotalForMonth(
  rows: ParsedElectricityRow[],
  periodPrefix: string,
): number {
  return rows
    .filter((row) => row.periodMonth.startsWith(periodPrefix))
    .reduce((sum, row) => sum + row.consumptionKwh, 0);
}

export function meterIdsPresent(rows: ParsedElectricityRow[]): Set<string> {
  return new Set(rows.map((row) => row.meterId));
}

export { SITE_DROP_COMPARE_FROM, SITE_DROP_COMPARE_TO };
