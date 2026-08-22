/** Shared domain enums mirrored from PostgreSQL types in 001_initial_schema.sql */

export const QUALITY_ACTIONS = ["fixed", "flagged", "rejected"] as const;
export type QualityAction = (typeof QUALITY_ACTIONS)[number];

export const INGESTION_STATUSES = ["running", "completed", "failed"] as const;
export type IngestionStatus = (typeof INGESTION_STATUSES)[number];

export const DATE_PRECISIONS = ["day", "month"] as const;
export type DatePrecision = (typeof DATE_PRECISIONS)[number];

/** PostgreSQL enum name: delivery_date_precision */
export const PG_DELIVERY_DATE_PRECISION = "delivery_date_precision";

export const AI_FINDING_TYPES = [
  "safety_category",
  "psychosocial_hazard",
  "severity_inconsistency",
] as const;
export type AiFindingType = (typeof AI_FINDING_TYPES)[number];

export const ENTITY_TABLES = [
  "fuel_deliveries",
  "electricity_readings",
  "incidents",
  "suppliers",
  "emission_factors",
] as const;
export type EntityTable = (typeof ENTITY_TABLES)[number];

/** Severity normalisation map from DATA_AUDIT.md — raw value preserved separately in DB. */
export const SEVERITY_NORMALISATION: Record<string, { rank: number; label: string }> = {
  Low: { rank: 1, label: "Low" },
  "1": { rank: 1, label: "Low" },
  Medium: { rank: 2, label: "Medium" },
  "2": { rank: 2, label: "Medium" },
  "3": { rank: 3, label: "High" },
};

export const ISSUE_CODES = {
  EXACT_DUPLICATE: "EXACT_DUPLICATE",
  DUPLICATE_SOURCE_IDENTIFIER: "DUPLICATE_SOURCE_IDENTIFIER",
  MONTH_ONLY_DATE: "MONTH_ONLY_DATE",
  CREDIT_REVERSAL: "CREDIT_REVERSAL",
  LARGE_DELIVERY: "LARGE_DELIVERY",
  MTR07_SCALE_SHIFT: "MTR07_SCALE_SHIFT",
  MISSING_METER: "MISSING_METER",
  INVALID_ABN: "INVALID_ABN",
  MISSING_ABN: "MISSING_ABN",
  DUPLICATE_SUPPLIER_ENTITY: "DUPLICATE_SUPPLIER_ENTITY",
} as const;

export type IssueCode = (typeof ISSUE_CODES)[keyof typeof ISSUE_CODES];
