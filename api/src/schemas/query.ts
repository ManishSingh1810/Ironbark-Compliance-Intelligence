import { z } from "zod";

import { ENTITY_TABLES, QUALITY_ACTIONS } from "../domain/constants.js";
import { AppError } from "../errors.js";

export const uuidSchema = z.string().uuid();

export const incidentsQuerySchema = z
  .object({
    severity: z.enum(["1", "2", "3", "Low", "Medium", "High"]).optional(),
    type: z.string().min(1).max(32).optional(),
  })
  .strict();

export const dataQualityIssuesQuerySchema = z
  .object({
    action: z.enum(QUALITY_ACTIONS).optional(),
    issueCode: z.string().min(1).max(64).optional(),
    sourceFilename: z.string().min(1).max(255).optional(),
    entityTable: z.enum(ENTITY_TABLES).optional(),
  })
  .strict();

export const evidenceParamsSchema = z
  .object({
    entityTable: z.enum(ENTITY_TABLES),
    entityId: uuidSchema,
  })
  .strict();

export type IncidentsQuery = z.infer<typeof incidentsQuerySchema>;
export type DataQualityIssuesQuery = z.infer<typeof dataQualityIssuesQuerySchema>;
export type EvidenceParams = z.infer<typeof evidenceParamsSchema>;

export function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown, message: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new AppError(400, "INVALID_QUERY", message);
  }
  return parsed.data;
}
