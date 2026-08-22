export type QualityAction = "fixed" | "flagged" | "rejected";

export interface QualityIssueDraft {
  entityTable: string;
  entityId: string | null;
  sourceFilename: string;
  sourceRow: number | null;
  fieldName: string | null;
  originalValue: string | null;
  cleanedValue: string | null;
  action: QualityAction;
  issueCode: string;
  explanation: string;
}

export interface ParseResult<T> {
  rows: T[];
  headerIssues: QualityIssueDraft[];
}

export interface CsvPhysicalRow {
  sourceRow: number;
  cells: Record<string, string>;
  rawCellsByHeader: Record<string, string>;
}

export interface SourceFileDescriptor {
  filename: string;
  absolutePath: string;
  hash: string;
  rowCount: number;
}
