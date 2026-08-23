import { AppError } from "../errors.js";
import type { IncidentClassificationOutput } from "./schemas/incident-classification.js";

export const MAX_EVIDENCE_EXCERPT_LENGTH = 300;

export class GroundingValidationError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = "GroundingValidationError";
    this.field = field;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Find the exact source substring matching excerpt (case-insensitive).
 * Returns the verbatim text from the description for storage.
 */
export function findGroundedExcerpt(description: string, excerpt: string): string | null {
  const trimmed = excerpt.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length > MAX_EVIDENCE_EXCERPT_LENGTH) {
    return null;
  }

  const regex = new RegExp(escapeRegExp(trimmed), "i");
  const match = description.match(regex);
  return match?.[0] ?? null;
}

/**
 * Deterministic source-context excerpt when no verbatim supporting excerpt applies.
 * Traceable context only — not proof of absence or consistency.
 */
export function deterministicSourceContext(description: string): string {
  if (description.length <= MAX_EVIDENCE_EXCERPT_LENGTH) {
    return description;
  }
  return description.slice(0, MAX_EVIDENCE_EXCERPT_LENGTH);
}

export interface GroundedClassification {
  output: IncidentClassificationOutput;
  groundedExcerpts: {
    category: string;
    psychosocial: string;
    severity: string;
  };
}

export function validateAndGroundClassification(
  description: string,
  output: IncidentClassificationOutput,
): GroundedClassification {
  const category = findGroundedExcerpt(description, output.categoryEvidenceExcerpt);
  if (!category) {
    throw new GroundingValidationError(
      "categoryEvidenceExcerpt",
      "Category evidence excerpt is not a verbatim substring of the incident description.",
    );
  }

  let psychosocial: string;
  if (output.psychosocialAssessment === "no") {
    if (output.psychosocialEvidenceExcerpt !== null) {
      throw new GroundingValidationError(
        "psychosocialEvidenceExcerpt",
        'Psychosocial assessment "no" must return null for psychosocialEvidenceExcerpt; invented negative evidence is not allowed.',
      );
    }
    psychosocial = deterministicSourceContext(description);
  } else {
    if (
      output.psychosocialEvidenceExcerpt === null ||
      output.psychosocialEvidenceExcerpt.trim() === ""
    ) {
      throw new GroundingValidationError(
        "psychosocialEvidenceExcerpt",
        `Psychosocial assessment "${output.psychosocialAssessment}" requires a non-null verbatim evidence excerpt.`,
      );
    }
    const groundedPsychosocial = findGroundedExcerpt(
      description,
      output.psychosocialEvidenceExcerpt,
    );
    if (!groundedPsychosocial) {
      throw new GroundingValidationError(
        "psychosocialEvidenceExcerpt",
        "Psychosocial evidence excerpt is not a verbatim substring of the incident description.",
      );
    }
    psychosocial = groundedPsychosocial;
  }

  let severity: string;
  if (output.severityAssessment === "consistent") {
    if (output.severityEvidenceExcerpt !== null) {
      throw new GroundingValidationError(
        "severityEvidenceExcerpt",
        'Severity assessment "consistent" must return null for severityEvidenceExcerpt; invented consistency evidence is not allowed.',
      );
    }
    severity = deterministicSourceContext(description);
  } else {
    if (
      output.severityEvidenceExcerpt === null ||
      output.severityEvidenceExcerpt.trim() === ""
    ) {
      throw new GroundingValidationError(
        "severityEvidenceExcerpt",
        `Severity assessment "${output.severityAssessment}" requires a non-null verbatim evidence excerpt.`,
      );
    }
    const groundedSeverity = findGroundedExcerpt(description, output.severityEvidenceExcerpt);
    if (!groundedSeverity) {
      throw new GroundingValidationError(
        "severityEvidenceExcerpt",
        "Severity evidence excerpt is not a verbatim substring of the incident description.",
      );
    }
    severity = groundedSeverity;
  }

  return {
    output,
    groundedExcerpts: {
      category,
      psychosocial,
      severity,
    },
  };
}

export function toGroundingAppError(error: GroundingValidationError): AppError {
  return new AppError(500, "AI_GROUNDING_VALIDATION_FAILED", error.message);
}
