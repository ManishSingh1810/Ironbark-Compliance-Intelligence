import { beforeEach, describe, expect, it, vi } from "vitest";

import { PROMPT_VERSION } from "../ai/config.js";
import { reviewPriority } from "./ai-incidents-service.js";

describe("reviewPriority", () => {
  it("ranks psychosocial yes highest", () => {
    expect(
      reviewPriority({
        psychosocialAssessment: "yes",
        severityAssessment: "consistent",
        analysisStatus: "complete",
      }),
    ).toBeLessThan(
      reviewPriority({
        psychosocialAssessment: "no",
        severityAssessment: "possibly_inconsistent",
        analysisStatus: "complete",
      }),
    );
  });

  it("ranks severity possibly_inconsistent before complete consistent incidents", () => {
    const inconsistent = reviewPriority({
      psychosocialAssessment: "no",
      severityAssessment: "possibly_inconsistent",
      analysisStatus: "complete",
    });
    const consistent = reviewPriority({
      psychosocialAssessment: "no",
      severityAssessment: "consistent",
      analysisStatus: "complete",
    });

    expect(inconsistent).toBeLessThan(consistent);
  });

  it("ranks uncertain assessments before complete consistent records", () => {
    expect(
      reviewPriority({
        psychosocialAssessment: "no",
        severityAssessment: "uncertain",
        analysisStatus: "complete",
      }),
    ).toBeLessThan(
      reviewPriority({
        psychosocialAssessment: "no",
        severityAssessment: "consistent",
        analysisStatus: "complete",
      }),
    );
  });

  it("represents partial and pending analysis honestly after complete records", () => {
    const complete = reviewPriority({
      psychosocialAssessment: "no",
      severityAssessment: "consistent",
      analysisStatus: "complete",
    });
    const partial = reviewPriority({
      psychosocialAssessment: null,
      severityAssessment: null,
      analysisStatus: "partial",
    });
    const pending = reviewPriority({
      psychosocialAssessment: null,
      severityAssessment: null,
      analysisStatus: "pending",
    });

    expect(complete).toBeLessThan(partial);
    expect(partial).toBeLessThan(pending);
  });
});

describe("AI summary/review version selection", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("OPENAI_MODEL", "gpt-4o-mini");
  });

  it("selects active v2 prompt version while leaving v1 rows out of the current summary", async () => {
    vi.doMock("../repositories/ingestion-run-repository.js", () => ({
      findLatestCompletedRunId: vi.fn().mockResolvedValue("run-1"),
    }));
    vi.doMock("../repositories/ai-incident-repository.js", () => ({
      countAnalysedIncidents: vi.fn().mockResolvedValue(2),
      countIncidentsInRun: vi.fn().mockResolvedValue(42),
      listFindingsForRun: vi.fn().mockImplementation(
        async (_runId: string, _model: string, promptVersion: string) => {
          expect(promptVersion).toBe(PROMPT_VERSION);
          expect(promptVersion).toBe("incident-classification-v3");
          return [];
        },
      ),
      listIncidentsForClassification: vi.fn().mockResolvedValue([]),
    }));

    const { getAiSummary, getIncidentsReview } = await import("./ai-incidents-service.js");
    const summary = await getAiSummary();
    const review = await getIncidentsReview();

    expect(summary.promptVersion).toBe("incident-classification-v3");
    expect(review.promptVersion).toBe("incident-classification-v3");
    expect(summary.promptVersion).not.toBe("incident-classification-v2");
  });
});
