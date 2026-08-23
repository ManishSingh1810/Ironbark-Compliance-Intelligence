import type { AiSummaryResponse, IncidentReviewItem } from "../api/types.js";

/** Backend vocabulary for review queue filtering — keep in sync with API serialisation. */
export const PSYCHOSOCIAL_YES = "yes" as const;
export const SEVERITY_POSSIBLY_INCONSISTENT = "possibly_inconsistent" as const;
export const ANALYSIS_COMPLETE = "complete" as const;

export type AiDisplayState =
  | "loading"
  | "request_failed"
  | "pending_or_mismatch"
  | "loaded_no_flags"
  | "loaded_with_flags";

export function resolveAiDisplayState(input: {
  aiSummary: AiSummaryResponse | null;
  reviewIncidents: IncidentReviewItem[] | null;
  aiSummaryError?: string;
  incidentsReviewError?: string;
}): AiDisplayState {
  if (input.aiSummaryError || input.incidentsReviewError) {
    return "request_failed";
  }
  if (!input.aiSummary || input.reviewIncidents === null) {
    return "loading";
  }

  const { analysedIncidentCount, pendingIncidentCount, totalIncidents } = input.aiSummary;

  if (analysedIncidentCount === 0 && pendingIncidentCount === totalIncidents && totalIncidents > 0) {
    return "pending_or_mismatch";
  }

  const reviewCount = input.reviewIncidents.filter(
    (incident) =>
      incident.psychosocialAssessment === PSYCHOSOCIAL_YES ||
      incident.severityAssessment === SEVERITY_POSSIBLY_INCONSISTENT,
  ).length;

  return reviewCount > 0 ? "loaded_with_flags" : "loaded_no_flags";
}

export function countAiReviewIncidents(
  incidents: Array<{
    psychosocialAssessment: string | null;
    severityAssessment: string | null;
  }>,
): number {
  return incidents.filter(
    (incident) =>
      incident.psychosocialAssessment === PSYCHOSOCIAL_YES ||
      incident.severityAssessment === SEVERITY_POSSIBLY_INCONSISTENT,
  ).length;
}
