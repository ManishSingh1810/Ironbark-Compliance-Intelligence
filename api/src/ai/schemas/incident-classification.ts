import { z } from "zod3";

/** Fixed safety categories aligned to Ironbark incident register patterns. */
export const SAFETY_CATEGORIES = [
  "vehicle_and_mobile_equipment",
  "equipment_and_machinery",
  "slips_trips_and_falls",
  "electrical",
  "hazardous_materials_and_dust",
  "environmental",
  "fatigue",
  "psychosocial",
  "other",
] as const;

export type SafetyCategory = (typeof SAFETY_CATEGORIES)[number];

export const PSYCHOSOCIAL_ASSESSMENTS = ["yes", "no", "uncertain"] as const;
export type PsychosocialAssessment = (typeof PSYCHOSOCIAL_ASSESSMENTS)[number];

export const SEVERITY_ASSESSMENTS = [
  "consistent",
  "possibly_understated",
  "possibly_overstated",
  "uncertain",
] as const;
export type SeverityAssessment = (typeof SEVERITY_ASSESSMENTS)[number];

const confidenceSchema = z.number().min(0).max(1);
const excerptSchema = z.string().min(1).max(300);
const explanationSchema = z.string().min(1).max(2000);

/** Structured output schema — one object per incident from OpenAI. */
export const incidentClassificationSchema = z.object({
  safetyCategory: z.enum(SAFETY_CATEGORIES),
  categoryEvidenceExcerpt: excerptSchema,
  categoryExplanation: explanationSchema,
  categoryConfidence: confidenceSchema,

  psychosocialAssessment: z.enum(PSYCHOSOCIAL_ASSESSMENTS),
  /** Null only when psychosocialAssessment is "no" (absence of evidence). */
  psychosocialEvidenceExcerpt: z.string().min(1).max(300).nullable(),
  psychosocialExplanation: explanationSchema,
  psychosocialConfidence: confidenceSchema,

  severityAssessment: z.enum(SEVERITY_ASSESSMENTS),
  /** Null only when severityAssessment is "consistent" (no inconsistency signal). */
  severityEvidenceExcerpt: z.string().min(1).max(300).nullable(),
  severityExplanation: explanationSchema,
  severityConfidence: confidenceSchema,
});

export type IncidentClassificationOutput = z.infer<typeof incidentClassificationSchema>;

export function mapPsychosocialToBoolean(
  assessment: PsychosocialAssessment,
): boolean | null {
  if (assessment === "yes") {
    return true;
  }
  if (assessment === "no") {
    return false;
  }
  return null;
}

export function mapSeverityToInconsistent(
  assessment: SeverityAssessment,
): boolean | null {
  if (assessment === "possibly_understated" || assessment === "possibly_overstated") {
    return true;
  }
  if (assessment === "consistent") {
    return false;
  }
  return null;
}
