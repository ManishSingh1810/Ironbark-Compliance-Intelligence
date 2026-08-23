import { describe, expect, it } from "vitest";

import type { AiSummaryResponse, IncidentReviewItem } from "../api/types.js";
import {
  ANALYSIS_COMPLETE,
  PSYCHOSOCIAL_YES,
  SEVERITY_POSSIBLY_INCONSISTENT,
  countAiReviewIncidents,
  resolveAiDisplayState,
} from "../utils/aiDisplay.js";

function reviewItem(
  overrides: Partial<IncidentReviewItem> & { sourceIncidentId: string },
): IncidentReviewItem {
  return {
    id: overrides.id ?? "11111111-1111-4111-8111-111111111111",
    sourceIncidentId: overrides.sourceIncidentId,
    description: overrides.description ?? "desc",
    severityRaw: overrides.severityRaw ?? "1",
    severityNormalised: overrides.severityNormalised ?? 1,
    severityLabel: overrides.severityLabel ?? "Low",
    typeCode: overrides.typeCode ?? "OTH",
    analysisStatus: overrides.analysisStatus ?? ANALYSIS_COMPLETE,
    safetyCategory: overrides.safetyCategory ?? "psychosocial",
    psychosocialAssessment: overrides.psychosocialAssessment ?? "no",
    severityAssessment: overrides.severityAssessment ?? "consistent",
    evidence: overrides.evidence ?? {
      safetyCategory: null,
      psychosocial: null,
      severity: null,
    },
    explanations: overrides.explanations ?? {
      safetyCategory: null,
      psychosocial: null,
      severity: null,
    },
    confidence: overrides.confidence ?? {
      safetyCategory: null,
      psychosocial: null,
      severity: null,
    },
    model: overrides.model ?? "gpt-4o-mini",
    promptVersion: overrides.promptVersion ?? "incident-classification-v3",
    sourceFilename: overrides.sourceFilename ?? "incident_register.csv",
    sourceRow: overrides.sourceRow ?? 2,
    requiresHumanReview: overrides.requiresHumanReview ?? true,
  };
}

const completeSummary: AiSummaryResponse = {
  ingestionRunId: "run-1",
  model: "gpt-4o-mini",
  promptVersion: "incident-classification-v3",
  configurationStatus: "configured",
  totalIncidents: 42,
  analysedIncidentCount: 42,
  pendingIncidentCount: 0,
  safetyCategoryCounts: [{ category: "psychosocial", count: 3 }],
  psychosocialCounts: { yes: 3, no: 39, uncertain: 0, pending: 0 },
  severityCounts: {
    consistent: 35,
    possiblyInconsistent: 7,
    uncertain: 0,
    pending: 0,
  },
};

describe("AI display vocabulary and queue counting", () => {
  it("uses exact backend enum strings", () => {
    expect(PSYCHOSOCIAL_YES).toBe("yes");
    expect(SEVERITY_POSSIBLY_INCONSISTENT).toBe("possibly_inconsistent");
    expect(ANALYSIS_COMPLETE).toBe("complete");
  });

  it("counts unique review incidents once when both flags apply", () => {
    const incidents = [
      reviewItem({
        sourceIncidentId: "INC-2025-127",
        psychosocialAssessment: PSYCHOSOCIAL_YES,
        severityAssessment: SEVERITY_POSSIBLY_INCONSISTENT,
      }),
      reviewItem({
        sourceIncidentId: "INC-2025-152",
        psychosocialAssessment: PSYCHOSOCIAL_YES,
        severityAssessment: SEVERITY_POSSIBLY_INCONSISTENT,
      }),
      reviewItem({
        sourceIncidentId: "INC-2026-109",
        psychosocialAssessment: PSYCHOSOCIAL_YES,
        severityAssessment: SEVERITY_POSSIBLY_INCONSISTENT,
      }),
      reviewItem({
        sourceIncidentId: "INC-2025-118",
        severityAssessment: SEVERITY_POSSIBLY_INCONSISTENT,
      }),
      reviewItem({
        sourceIncidentId: "INC-2025-141",
        severityAssessment: SEVERITY_POSSIBLY_INCONSISTENT,
      }),
      reviewItem({
        sourceIncidentId: "INC-2026-029",
        severityAssessment: SEVERITY_POSSIBLY_INCONSISTENT,
      }),
      reviewItem({
        sourceIncidentId: "INC-2026-134",
        severityAssessment: SEVERITY_POSSIBLY_INCONSISTENT,
      }),
      reviewItem({ sourceIncidentId: "INC-2026-131" }),
    ];

    expect(countAiReviewIncidents(incidents)).toBe(7);
    expect(
      incidents.filter((i) => i.psychosocialAssessment === PSYCHOSOCIAL_YES),
    ).toHaveLength(3);
  });

  it("resolves loaded_with_flags for complete v3 summary shape", () => {
    const state = resolveAiDisplayState({
      aiSummary: completeSummary,
      reviewIncidents: [
        reviewItem({
          sourceIncidentId: "INC-2025-127",
          psychosocialAssessment: PSYCHOSOCIAL_YES,
        }),
      ],
    });
    expect(state).toBe("loaded_with_flags");
  });

  it("resolves request_failed when AI summary request errors", () => {
    const state = resolveAiDisplayState({
      aiSummary: null,
      reviewIncidents: null,
      aiSummaryError: "Request failed",
    });
    expect(state).toBe("request_failed");
  });

  it("resolves pending_or_mismatch when analysed is 0 and all pending", () => {
    const state = resolveAiDisplayState({
      aiSummary: {
        ...completeSummary,
        model: "gpt-4o-",
        analysedIncidentCount: 0,
        pendingIncidentCount: 42,
        psychosocialCounts: { yes: 0, no: 0, uncertain: 0, pending: 42 },
        severityCounts: {
          consistent: 0,
          possiblyInconsistent: 0,
          uncertain: 0,
          pending: 42,
        },
        safetyCategoryCounts: [],
      },
      reviewIncidents: [],
    });
    expect(state).toBe("pending_or_mismatch");
  });
});
