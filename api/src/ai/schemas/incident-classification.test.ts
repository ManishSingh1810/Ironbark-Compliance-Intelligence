import { describe, expect, it } from "vitest";

import {
  incidentClassificationSchema,
  mapPsychosocialToBoolean,
  mapSeverityToInconsistent,
} from "./incident-classification.js";

const validPayload = {
  safetyCategory: "psychosocial",
  categoryEvidenceExcerpt: "verbal abuse",
  categoryExplanation: "This may indicate a psychosocial hazard; recommended for human review.",
  categoryConfidence: 0.88,
  psychosocialAssessment: "yes",
  psychosocialEvidenceExcerpt: "verbal abuse",
  psychosocialExplanation:
    "Repeated verbal abuse may indicate psychosocial harm; recommended for human review.",
  psychosocialConfidence: 0.91,
  severityAssessment: "uncertain",
  severityEvidenceExcerpt: "verbal abuse",
  severityExplanation: "Severity consistency is uncertain; recommended for human review.",
  severityConfidence: 0.55,
};

describe("incidentClassificationSchema", () => {
  it("accepts valid structured output", () => {
    expect(incidentClassificationSchema.parse(validPayload)).toEqual(validPayload);
  });

  it("accepts null psychosocial evidence for psychosocial no", () => {
    const parsed = incidentClassificationSchema.parse({
      ...validPayload,
      psychosocialAssessment: "no",
      psychosocialEvidenceExcerpt: null,
      psychosocialExplanation:
        "The supplied description does not contain an identifiable psychosocial indicator and still requires human review.",
    });
    expect(parsed.psychosocialEvidenceExcerpt).toBeNull();
  });

  it("accepts null severity evidence for severity consistent", () => {
    const parsed = incidentClassificationSchema.parse({
      ...validPayload,
      severityAssessment: "consistent",
      severityEvidenceExcerpt: null,
      severityExplanation:
        "No clear inconsistency signal was identified in the supplied description; human review is still recommended.",
    });
    expect(parsed.severityEvidenceExcerpt).toBeNull();
  });

  it("rejects invalid confidence values", () => {
    expect(() =>
      incidentClassificationSchema.parse({ ...validPayload, categoryConfidence: 1.5 }),
    ).toThrow();
    expect(() =>
      incidentClassificationSchema.parse({ ...validPayload, psychosocialConfidence: -0.1 }),
    ).toThrow();
  });
});

describe("assessment mappings", () => {
  it("maps psychosocial yes/no/uncertain to boolean/null", () => {
    expect(mapPsychosocialToBoolean("yes")).toBe(true);
    expect(mapPsychosocialToBoolean("no")).toBe(false);
    expect(mapPsychosocialToBoolean("uncertain")).toBeNull();
  });

  it("maps severity assessments to inconsistency boolean/null", () => {
    expect(mapSeverityToInconsistent("possibly_understated")).toBe(true);
    expect(mapSeverityToInconsistent("possibly_overstated")).toBe(true);
    expect(mapSeverityToInconsistent("consistent")).toBe(false);
    expect(mapSeverityToInconsistent("uncertain")).toBeNull();
  });
});
