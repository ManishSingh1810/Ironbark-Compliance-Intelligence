import { beforeEach, describe, expect, it, vi } from "vitest";

import { PROMPT_VERSION } from "../ai/config.js";
import {
  IncompleteAnalysisError,
  hasCompleteAnalysis,
  insertFindings,
  type AiFindingInsert,
} from "./ai-incident-repository.js";

const INCIDENT_ID = "11111111-1111-4111-8111-111111111111";
const MODEL = "gpt-4o-mini";
const V1 = "incident-classification-v1";
const V2 = PROMPT_VERSION;

function makeFinding(
  findingType: AiFindingInsert["findingType"],
  overrides: Partial<AiFindingInsert> = {},
): AiFindingInsert {
  return {
    incidentId: INCIDENT_ID,
    findingType,
    safetyCategory: findingType === "safety_category" ? "slips_trips_and_falls" : null,
    isPsychosocialHazard: findingType === "psychosocial_hazard" ? false : null,
    severityInconsistent: findingType === "severity_inconsistency" ? true : null,
    evidenceExcerpt: "fractured forearm",
    explanation: `${findingType} explanation`,
    confidence: 0.9,
    model: MODEL,
    promptVersion: V2,
    ...overrides,
  };
}

const ALL_FINDINGS: AiFindingInsert[] = [
  makeFinding("safety_category"),
  makeFinding("psychosocial_hazard"),
  makeFinding("severity_inconsistency"),
];

interface StoredFinding {
  findingType: AiFindingInsert["findingType"];
  evidenceExcerpt: string;
  explanation: string;
  promptVersion: string;
}

function createMockClient(initial: StoredFinding[] = []) {
  const stored = [...initial];

  const client = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes("INSERT INTO ai_incident_analysis")) {
        const findingType = params?.[1] as AiFindingInsert["findingType"];
        const evidenceExcerpt = params?.[5] as string;
        const explanation = params?.[6] as string;
        const promptVersion = params?.[9] as string;
        const exists = stored.some(
          (row) => row.findingType === findingType && row.promptVersion === promptVersion,
        );
        if (!exists) {
          stored.push({ findingType, evidenceExcerpt, explanation, promptVersion });
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
    stored: () => stored,
  };

  return client;
}

describe("insertFindings partial analysis recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("recovers a partial analysis to three findings without overwriting existing rows", async () => {
    const client = createMockClient([
      {
        findingType: "safety_category",
        evidenceExcerpt: "original category excerpt",
        explanation: "original category explanation",
        promptVersion: V2,
      },
    ]);

    await insertFindings(client as never, ALL_FINDINGS);

    expect(client.stored()).toHaveLength(3);
    expect(client.stored()[0]?.evidenceExcerpt).toBe("original category excerpt");
    expect(client.stored()[0]?.explanation).toBe("original category explanation");
    expect(client.stored().map((row) => row.findingType)).toEqual([
      "safety_category",
      "psychosocial_hazard",
      "severity_inconsistency",
    ]);
  });

  it("does not overwrite existing finding content on conflict", async () => {
    const client = createMockClient([
      {
        findingType: "psychosocial_hazard",
        evidenceExcerpt: "kept excerpt",
        explanation: "kept explanation",
        promptVersion: V2,
      },
    ]);

    await insertFindings(client as never, [
      makeFinding("psychosocial_hazard", {
        evidenceExcerpt: "replacement excerpt",
        explanation: "replacement explanation",
      }),
      makeFinding("safety_category"),
      makeFinding("severity_inconsistency"),
    ]);

    const psych = client.stored().find((row) => row.findingType === "psychosocial_hazard");
    expect(psych?.evidenceExcerpt).toBe("kept excerpt");
    expect(psych?.explanation).toBe("kept explanation");
  });

  it("rolls back when the complete three-finding set is not present after insertion", async () => {
    const client = createMockClient([
      {
        findingType: "safety_category",
        evidenceExcerpt: "original",
        explanation: "original",
        promptVersion: V2,
      },
    ]);

    await expect(
      insertFindings(client as never, [
        makeFinding("safety_category"),
        makeFinding("psychosocial_hazard"),
      ]),
    ).rejects.toBeInstanceOf(IncompleteAnalysisError);

    expect(client.stored().map((row) => row.findingType).sort()).toEqual([
      "psychosocial_hazard",
      "safety_category",
    ]);
  });

  it("inserts v2 findings without overwriting stored v1 rows", async () => {
    const client = createMockClient([
      {
        findingType: "safety_category",
        evidenceExcerpt: "v1 category",
        explanation: "v1 category explanation",
        promptVersion: V1,
      },
      {
        findingType: "psychosocial_hazard",
        evidenceExcerpt: "v1 psych",
        explanation: "v1 psych explanation",
        promptVersion: V1,
      },
      {
        findingType: "severity_inconsistency",
        evidenceExcerpt: "v1 severity",
        explanation: "v1 severity explanation",
        promptVersion: V1,
      },
    ]);

    await insertFindings(client as never, ALL_FINDINGS);

    expect(client.stored()).toHaveLength(6);
    const v1Rows = client.stored().filter((row) => row.promptVersion === V1);
    const v2Rows = client.stored().filter((row) => row.promptVersion === V2);
    expect(v1Rows).toHaveLength(3);
    expect(v2Rows).toHaveLength(3);
    expect(v1Rows[0]?.evidenceExcerpt).toBe("v1 category");
  });
});

describe("hasCompleteAnalysis version isolation", () => {
  it("does not treat complete v1 rows as complete for v2", async () => {
    const { query } = await import("../db/client.js");
    const querySpy = vi.spyOn(
      await import("../db/client.js"),
      "query",
    );

    querySpy.mockImplementation(async (_sql: string, params?: unknown[]) => {
      const promptVersion = params?.[2] as string;
      return {
        rows: [{ count: promptVersion === V1 ? "3" : "0" }],
        command: "SELECT",
        rowCount: 1,
        oid: 0,
        fields: [],
      } as never;
    });

    try {
      await expect(hasCompleteAnalysis(INCIDENT_ID, MODEL, V1)).resolves.toBe(true);
      await expect(hasCompleteAnalysis(INCIDENT_ID, MODEL, V2)).resolves.toBe(false);
      expect(querySpy).toHaveBeenCalledWith(expect.any(String), [INCIDENT_ID, MODEL, V1]);
      expect(querySpy).toHaveBeenCalledWith(expect.any(String), [INCIDENT_ID, MODEL, V2]);
    } finally {
      querySpy.mockRestore();
    }

    void query;
  });
});
