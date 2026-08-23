import { describe, expect, it } from "vitest";

import {
  GroundingValidationError,
  deterministicSourceContext,
  findGroundedExcerpt,
  validateAndGroundClassification,
} from "./grounding.js";
import type { IncidentClassificationOutput } from "./schemas/incident-classification.js";

const DESCRIPTION =
  "Worker fell from ladder in workshop, Fractured forearm, transported to Mater Hospital for surgery.";

const BASE_OUTPUT: IncidentClassificationOutput = {
  safetyCategory: "slips_trips_and_falls",
  categoryEvidenceExcerpt: "fractured forearm",
  categoryExplanation: "This may indicate a fall-related injury and is recommended for human review.",
  categoryConfidence: 0.9,
  psychosocialAssessment: "no",
  psychosocialEvidenceExcerpt: null,
  psychosocialExplanation:
    "The supplied description does not contain an identifiable psychosocial indicator and still requires human review.",
  psychosocialConfidence: 0.8,
  severityAssessment: "possibly_understated",
  severityEvidenceExcerpt: "fractured forearm",
  severityExplanation:
    "The description appears potentially inconsistent with recorded Low severity; recommended for human review.",
  severityConfidence: 0.85,
};

describe("grounding validation", () => {
  it("psychosocial yes + exact excerpt passes", () => {
    const grounded = validateAndGroundClassification(DESCRIPTION, {
      ...BASE_OUTPUT,
      psychosocialAssessment: "yes",
      psychosocialEvidenceExcerpt: "fell from ladder",
      psychosocialExplanation:
        "This may indicate a psychosocial concern; recommended for human review.",
    });
    expect(grounded.groundedExcerpts.psychosocial).toBe("fell from ladder");
  });

  it("psychosocial yes + invented excerpt fails", () => {
    expect(() =>
      validateAndGroundClassification(DESCRIPTION, {
        ...BASE_OUTPUT,
        psychosocialAssessment: "yes",
        psychosocialEvidenceExcerpt: "verbal abuse from supervisor",
      }),
    ).toThrow(GroundingValidationError);
  });

  it("psychosocial uncertain requires exact evidence", () => {
    expect(() =>
      validateAndGroundClassification(DESCRIPTION, {
        ...BASE_OUTPUT,
        psychosocialAssessment: "uncertain",
        psychosocialEvidenceExcerpt: null,
      }),
    ).toThrow(/requires a non-null/);

    const grounded = validateAndGroundClassification(DESCRIPTION, {
      ...BASE_OUTPUT,
      psychosocialAssessment: "uncertain",
      psychosocialEvidenceExcerpt: "workshop",
      psychosocialExplanation: "Uncertainty remains; recommended for human review.",
    });
    expect(grounded.groundedExcerpts.psychosocial).toBe("workshop");
  });

  it("psychosocial no + null uses deterministic source context", () => {
    const grounded = validateAndGroundClassification(DESCRIPTION, BASE_OUTPUT);
    expect(grounded.groundedExcerpts.psychosocial).toBe(
      deterministicSourceContext(DESCRIPTION),
    );
    expect(grounded.groundedExcerpts.category).toBe("Fractured forearm");
  });

  it("psychosocial no never stores invented negative evidence", () => {
    expect(() =>
      validateAndGroundClassification(DESCRIPTION, {
        ...BASE_OUTPUT,
        psychosocialEvidenceExcerpt: "No psychosocial hazard mentioned",
      }),
    ).toThrow(/must return null/);
  });

  it("category invented excerpts still fail", () => {
    expect(() =>
      validateAndGroundClassification(DESCRIPTION, {
        ...BASE_OUTPUT,
        categoryEvidenceExcerpt: "broken leg",
      }),
    ).toThrow(/Category evidence/);
  });

  it("severity consistent + null uses deterministic source context", () => {
    const grounded = validateAndGroundClassification(DESCRIPTION, {
      ...BASE_OUTPUT,
      severityAssessment: "consistent",
      severityEvidenceExcerpt: null,
      severityExplanation:
        "No clear inconsistency signal was identified in the supplied description; human review is still recommended.",
    });
    expect(grounded.groundedExcerpts.severity).toBe(deterministicSourceContext(DESCRIPTION));
  });

  it("severity consistent never stores invented consistency evidence", () => {
    expect(() =>
      validateAndGroundClassification(DESCRIPTION, {
        ...BASE_OUTPUT,
        severityAssessment: "consistent",
        severityEvidenceExcerpt: "no serious injury",
      }),
    ).toThrow(/must return null/);
  });

  it("severity possibly inconsistent requires exact evidence", () => {
    expect(() =>
      validateAndGroundClassification(DESCRIPTION, {
        ...BASE_OUTPUT,
        severityAssessment: "possibly_understated",
        severityEvidenceExcerpt: "life-threatening trauma",
      }),
    ).toThrow(/Severity evidence/);
  });

  it("truncates deterministic source context at 300 characters", () => {
    const longDescription = "a".repeat(350);
    expect(deterministicSourceContext(longDescription)).toHaveLength(300);
    expect(deterministicSourceContext(longDescription)).toBe("a".repeat(300));
  });

  it("rejects empty excerpts for findGroundedExcerpt", () => {
    expect(findGroundedExcerpt("some text", "   ")).toBeNull();
  });
});
