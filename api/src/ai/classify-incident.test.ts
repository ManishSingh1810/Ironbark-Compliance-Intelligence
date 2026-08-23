import { beforeEach, describe, expect, it, vi } from "vitest";

import { PROMPT_VERSION } from "./config.js";
import {
  buildFindingsFromClassification,
  classifyAndStoreIncident,
} from "./classify-incident.js";
import { GroundingValidationError, validateAndGroundClassification } from "./grounding.js";
import { OpenAiClassificationError } from "./openai-client.js";
import type { IncidentClassificationOutput } from "./schemas/incident-classification.js";
import type { IncidentForClassification } from "../repositories/ai-incident-repository.js";
import { IncompleteAnalysisError } from "../repositories/ai-incident-repository.js";

vi.mock("../db/client.js", () => ({
  withTransaction: vi.fn(async (fn: (client: unknown) => Promise<void>) => fn({})),
}));

vi.mock("../repositories/ai-incident-repository.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../repositories/ai-incident-repository.js")>();
  return {
    ...actual,
    insertFindings: vi.fn(),
  };
});

import { withTransaction } from "../db/client.js";
import { insertFindings } from "../repositories/ai-incident-repository.js";

const INCIDENT: IncidentForClassification = {
  id: "11111111-1111-4111-8111-111111111111",
  source_incident_id: "INC-2025-118",
  severity_raw: "1",
  severity_normalised: 1,
  severity_label: "Low",
  type_code: "SLP",
  description:
    "Worker fell from ladder in workshop, fractured forearm, transported to Mater Hospital for surgery.",
  source_filename: "incident_register.csv",
  source_row: 12,
};

const VALID_OUTPUT: IncidentClassificationOutput = {
  safetyCategory: "slips_trips_and_falls",
  categoryEvidenceExcerpt: "fractured forearm",
  categoryExplanation: "This may indicate a serious fall injury; recommended for human review.",
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
  severityConfidence: 0.87,
};

describe("classifyAndStoreIncident", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(withTransaction).mockImplementation(async (fn) => fn({} as never));
    vi.mocked(insertFindings).mockResolvedValue(undefined);
  });

  it("stores three grounded findings together after valid structured response", async () => {
    const requestClassification = vi.fn().mockResolvedValue(VALID_OUTPUT);

    await classifyAndStoreIncident(
      INCIDENT,
      { apiKey: "test-key", model: "gpt-test", promptVersion: PROMPT_VERSION },
      { requestClassification },
    );

    expect(requestClassification).toHaveBeenCalledOnce();
    expect(withTransaction).toHaveBeenCalledOnce();
    expect(insertFindings).toHaveBeenCalledOnce();

    const findings = vi.mocked(insertFindings).mock.calls[0]?.[1];
    expect(findings).toHaveLength(3);
    expect(findings?.map((finding) => finding.findingType)).toEqual([
      "safety_category",
      "psychosocial_hazard",
      "severity_inconsistency",
    ]);
    expect(findings?.every((finding) => finding.incidentId === INCIDENT.id)).toBe(true);
    expect(findings?.every((finding) => finding.model === "gpt-test")).toBe(true);
  });

  it("rejects invented evidence and does not insert findings", async () => {
    const requestClassification = vi.fn().mockResolvedValue({
      ...VALID_OUTPUT,
      categoryEvidenceExcerpt: "broken leg",
    });

    await expect(
      classifyAndStoreIncident(
        INCIDENT,
        { apiKey: "test-key", model: "gpt-test", promptVersion: PROMPT_VERSION },
        { requestClassification },
      ),
    ).rejects.toBeInstanceOf(GroundingValidationError);

    expect(insertFindings).not.toHaveBeenCalled();
  });

  it("rejects psychosocial no with invented negative excerpt", async () => {
    const requestClassification = vi.fn().mockResolvedValue({
      ...VALID_OUTPUT,
      psychosocialEvidenceExcerpt: "No psychosocial hazard mentioned",
    });

    await expect(
      classifyAndStoreIncident(
        INCIDENT,
        { apiKey: "test-key", model: "gpt-test", promptVersion: PROMPT_VERSION },
        { requestClassification },
      ),
    ).rejects.toBeInstanceOf(GroundingValidationError);

    expect(insertFindings).not.toHaveBeenCalled();
  });

  it("does not endlessly retry schema or grounding failures", async () => {
    const requestClassification = vi
      .fn()
      .mockRejectedValue(new OpenAiClassificationError("refused", false));

    await expect(
      classifyAndStoreIncident(
        INCIDENT,
        { apiKey: "test-key", model: "gpt-test", promptVersion: PROMPT_VERSION },
        { requestClassification },
      ),
    ).rejects.toBeInstanceOf(OpenAiClassificationError);

    expect(requestClassification).toHaveBeenCalledOnce();
  });

  it("retries transient failures with bounded attempts", async () => {
    const requestClassification = vi
      .fn()
      .mockRejectedValueOnce(new OpenAiClassificationError("rate limit", true))
      .mockResolvedValueOnce(VALID_OUTPUT);

    await classifyAndStoreIncident(
      INCIDENT,
      { apiKey: "test-key", model: "gpt-test", promptVersion: PROMPT_VERSION },
      { requestClassification },
    );

    expect(requestClassification).toHaveBeenCalledTimes(2);
    expect(insertFindings).toHaveBeenCalledOnce();
  });

  it("rolls back when insertion cannot reach a complete three-finding set", async () => {
    const requestClassification = vi.fn().mockResolvedValue(VALID_OUTPUT);
    vi.mocked(insertFindings).mockReset();
    vi.mocked(insertFindings).mockRejectedValue(new IncompleteAnalysisError("Incomplete analysis"));
    vi.mocked(withTransaction).mockImplementation(async (fn) => fn({} as never));

    await expect(
      classifyAndStoreIncident(
        INCIDENT,
        { apiKey: "test-key", model: "gpt-test", promptVersion: PROMPT_VERSION },
        { requestClassification },
      ),
    ).rejects.toThrow("Incomplete analysis");
  });
});

describe("buildFindingsFromClassification", () => {
  it("preserves internal incident UUID linkage and mapped booleans", () => {
    const grounded = validateAndGroundClassification(INCIDENT.description, VALID_OUTPUT);
    const findings = buildFindingsFromClassification(
      INCIDENT.id,
      { apiKey: "test", model: "gpt-test", promptVersion: PROMPT_VERSION },
      grounded,
    );

    expect(findings[1]?.isPsychosocialHazard).toBe(false);
    expect(findings[2]?.severityInconsistent).toBe(true);
    expect(findings[0]?.safetyCategory).toBe("slips_trips_and_falls");
  });
});
