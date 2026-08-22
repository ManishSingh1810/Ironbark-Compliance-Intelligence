import type { CsvPhysicalRow } from "../types.js";

export function exactRowFingerprint(row: CsvPhysicalRow, columnOrder: string[]): string {
  return columnOrder.map((column) => row.rawCellsByHeader[column] ?? "").join("\u001f");
}

export function findExactDuplicateSourceRows(
  rows: CsvPhysicalRow[],
  columnOrder: string[],
): Map<string, number> {
  const firstSeen = new Map<string, number>();
  for (const row of rows) {
    const fingerprint = exactRowFingerprint(row, columnOrder);
    if (!firstSeen.has(fingerprint)) {
      firstSeen.set(fingerprint, row.sourceRow);
    }
  }
  return firstSeen;
}

export function isExactDuplicate(
  row: CsvPhysicalRow,
  columnOrder: string[],
  firstSeen: Map<string, number>,
): boolean {
  const fingerprint = exactRowFingerprint(row, columnOrder);
  const canonicalRow = firstSeen.get(fingerprint);
  return canonicalRow !== undefined && canonicalRow !== row.sourceRow;
}

export function canonicalSourceRow(
  row: CsvPhysicalRow,
  columnOrder: string[],
  firstSeen: Map<string, number>,
): number {
  const fingerprint = exactRowFingerprint(row, columnOrder);
  return firstSeen.get(fingerprint) ?? row.sourceRow;
}
