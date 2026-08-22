import { z } from "zod";

import type { ParseResult, QualityIssueDraft } from "../types.js";
import { readCsvWithPhysicalRows } from "../csv-reader.js";
import { buildFileHeaderTrimIssues } from "../quality/issues.js";

export const emissionFactorRowSchema = z.object({
  activity: z.string().min(1),
  scope: z.string().min(1),
  unit: z.string().min(1),
  kg_co2e_per_unit: z.string().min(1),
  source: z.string().min(1),
});

export interface ParsedEmissionFactorRow {
  sourceRow: number;
  activity: string;
  scope: number;
  unit: string;
  kgCo2ePerUnit: number;
  factorSource: string;
  issues: QualityIssueDraft[];
}

export function parseEmissionFactorsCsv(
  content: string,
  sourceFilename: string,
): ParseResult<ParsedEmissionFactorRow> {
  const { rawHeaders, headers, rows } = readCsvWithPhysicalRows(content);
  const headerIssues = buildFileHeaderTrimIssues(
    rawHeaders,
    headers,
    "emission_factors",
    sourceFilename,
  );
  const parsedRows: ParsedEmissionFactorRow[] = [];

  for (const row of rows) {
    const validated = emissionFactorRowSchema.parse(row.cells);
    const scope = Number.parseInt(validated.scope, 10);
    const kgCo2ePerUnit = Number.parseFloat(validated.kg_co2e_per_unit);

    if (Number.isNaN(scope) || Number.isNaN(kgCo2ePerUnit)) {
      throw new Error(`Invalid emission factor row at source_row ${row.sourceRow}`);
    }

    parsedRows.push({
      sourceRow: row.sourceRow,
      activity: validated.activity.trim(),
      scope,
      unit: validated.unit.trim(),
      kgCo2ePerUnit,
      factorSource: validated.source.trim(),
      issues: [],
    });
  }

  return { rows: parsedRows, headerIssues };
}
