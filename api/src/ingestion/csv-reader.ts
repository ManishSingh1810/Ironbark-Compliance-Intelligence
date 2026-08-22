import { parse } from "csv-parse/sync";

import type { CsvPhysicalRow } from "./types.js";

function parseCsvLine(line: string): string[] {
  const records = parse(line, {
    relax_column_count: true,
    trim: false,
    skip_empty_lines: false,
  }) as string[][];
  return records[0] ?? [];
}

/**
 * Reads a CSV preserving 1-based physical line numbers (header = line 1, first data row = line 2).
 */
export function readCsvWithPhysicalRows(content: string): {
  rawHeaders: string[];
  headers: string[];
  rows: CsvPhysicalRow[];
} {
  const lines = content.split(/\r?\n/);
  if (lines.length === 0 || lines[0] === undefined) {
    throw new Error("CSV file is empty");
  }

  const rawHeaderCells = parseCsvLine(lines[0]);
  const rawHeaders = [...rawHeaderCells];
  const headers = rawHeaderCells.map((cell) => cell.trim());

  const rows: CsvPhysicalRow[] = [];
  for (let lineIndex = 1; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    if (line === undefined || line.trim() === "") {
      continue;
    }

    const sourceRow = lineIndex + 1;
    const valueCells = parseCsvLine(line);
    const rawCellsByHeader: Record<string, string> = {};
    const cells: Record<string, string> = {};

    headers.forEach((header, columnIndex) => {
      const rawValue = valueCells[columnIndex] ?? "";
      rawCellsByHeader[header] = rawValue;
      cells[header] = rawValue.trim();
    });

    rows.push({ sourceRow, cells, rawCellsByHeader });
  }

  return { rawHeaders, headers, rows };
}

export function physicalSourceRow(dataRowIndex: number): number {
  return dataRowIndex + 2;
}
