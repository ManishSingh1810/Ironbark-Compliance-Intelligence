import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

import { PROMPT_VERSION } from "./config.js";
import {
  INCIDENT_CLASSIFICATION_V2_PROMPT_VERSION,
  INCIDENT_CLASSIFICATION_SYSTEM_PROMPT as V2_PROMPT,
} from "./prompts/incident-classification-v2.js";
import {
  INCIDENT_CLASSIFICATION_V3_PROMPT_VERSION,
  INCIDENT_CLASSIFICATION_SYSTEM_PROMPT as V3_PROMPT,
} from "./prompts/incident-classification-v3.js";
import { hasCompleteAnalysis } from "../repositories/ai-incident-repository.js";

const INCIDENT_ID = "11111111-1111-4111-8111-111111111111";
const MODEL = "gpt-4o-mini";
const V1 = "incident-classification-v1";
const V2 = INCIDENT_CLASSIFICATION_V2_PROMPT_VERSION;
const V3 = INCIDENT_CLASSIFICATION_V3_PROMPT_VERSION;

describe("prompt version immutability", () => {
  it("sets active PROMPT_VERSION to v3", () => {
    expect(PROMPT_VERSION).toBe("incident-classification-v3");
    expect(INCIDENT_CLASSIFICATION_V3_PROMPT_VERSION).toBe(PROMPT_VERSION);
  });

  it("v2 and v3 prompt constants differ on severity rules", () => {
    expect(V2).toBe("incident-classification-v2");
    expect(V3).toBe("incident-classification-v3");
    expect(V2_PROMPT).not.toBe(V3_PROMPT);
    expect(V2_PROMPT).toContain(
      "categoryEvidenceExcerpt and severityEvidenceExcerpt MUST be copied verbatim",
    );
    expect(V2_PROMPT).not.toContain("severityAssessment is \"consistent\": severityEvidenceExcerpt MUST be null");
    expect(V3_PROMPT).toContain(
      'If severityAssessment is "consistent": severityEvidenceExcerpt MUST be null',
    );
  });

  it("active OpenAI client imports the v3 prompt template", async () => {
    const openAiModule = await import("./openai-client.js");
    const v3Module = await import("./prompts/incident-classification-v3.js");
    expect(v3Module.INCIDENT_CLASSIFICATION_SYSTEM_PROMPT).toContain(
      'assessment "consistent" plus a null excerpt',
    );

    const openAiClientPath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "openai-client.ts",
    );
    const openAiClientSource = readFileSync(openAiClientPath, "utf8");
    expect(openAiClientSource).toContain("./prompts/incident-classification-v3.js");
    expect(openAiClientSource).not.toContain("./prompts/incident-classification-v2.js");
    expect(openAiModule.requestIncidentClassification).toBeTypeOf("function");
  });

  it("complete v2 findings do not cause v3 classification to be skipped", async () => {
    const querySpy = vi.spyOn(await import("../db/client.js"), "query");
    querySpy.mockImplementation(async (_sql: string, params?: unknown[]) => {
      const promptVersion = params?.[2] as string;
      return {
        rows: [{ count: promptVersion === V2 ? "3" : "0" }],
        command: "SELECT",
        rowCount: 1,
        oid: 0,
        fields: [],
      } as never;
    });

    try {
      await expect(hasCompleteAnalysis(INCIDENT_ID, MODEL, V2)).resolves.toBe(true);
      await expect(hasCompleteAnalysis(INCIDENT_ID, MODEL, V3)).resolves.toBe(false);
    } finally {
      querySpy.mockRestore();
    }
  });
});

describe("prompt version coexistence in repository", () => {
  it("allows v3 findings to coexist with v1 and v2 under distinct prompt_version keys", async () => {
    const { insertFindings } = await import("../repositories/ai-incident-repository.js");

    interface Stored {
      findingType: string;
      promptVersion: string;
    }

    const stored: Stored[] = [
      { findingType: "safety_category", promptVersion: V1 },
      { findingType: "psychosocial_hazard", promptVersion: V1 },
      { findingType: "severity_inconsistency", promptVersion: V1 },
      { findingType: "safety_category", promptVersion: V2 },
      { findingType: "psychosocial_hazard", promptVersion: V2 },
      { findingType: "severity_inconsistency", promptVersion: V2 },
    ];

    const client = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes("INSERT INTO ai_incident_analysis")) {
          const findingType = params?.[1] as string;
          const promptVersion = params?.[9] as string;
          const exists = stored.some(
            (row) => row.findingType === findingType && row.promptVersion === promptVersion,
          );
          if (!exists) {
            stored.push({ findingType, promptVersion });
          }
          return { rows: [] };
        }
        if (sql.includes("array_agg")) {
          const promptVersion = params?.[2] as string;
          const findingTypes = stored
            .filter((row) => row.promptVersion === promptVersion)
            .map((row) => row.findingType)
            .sort();
          return { rows: [{ finding_types: findingTypes }] };
        }
        return { rows: [] };
      }),
    };

    const v3Findings = (
      ["safety_category", "psychosocial_hazard", "severity_inconsistency"] as const
    ).map((findingType) => ({
      incidentId: INCIDENT_ID,
      findingType,
      safetyCategory: findingType === "safety_category" ? "other" : null,
      isPsychosocialHazard: findingType === "psychosocial_hazard" ? false : null,
      severityInconsistent: findingType === "severity_inconsistency" ? false : null,
      evidenceExcerpt: "context excerpt",
      explanation: `${findingType} v3 explanation`,
      confidence: 0.8,
      model: MODEL,
      promptVersion: V3,
    }));

    await insertFindings(client as never, v3Findings);

    expect(stored.filter((row) => row.promptVersion === V1)).toHaveLength(3);
    expect(stored.filter((row) => row.promptVersion === V2)).toHaveLength(3);
    expect(stored.filter((row) => row.promptVersion === V3)).toHaveLength(3);
  });
});
