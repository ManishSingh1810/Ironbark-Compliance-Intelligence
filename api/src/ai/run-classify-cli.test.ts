import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../repositories/ingestion-run-repository.js", () => ({
  findLatestCompletedRunId: vi.fn(),
}));

vi.mock("../repositories/ai-incident-repository.js", () => ({
  hasCompleteAnalysis: vi.fn(),
  listIncidentsForClassification: vi.fn(),
}));

vi.mock("./classify-incident.js", () => ({
  classifyAndStoreIncident: vi.fn(),
  mapWithConcurrency: vi.fn(
    async (
      items: unknown[],
      _concurrency: number,
      fn: (item: unknown) => Promise<unknown>,
    ) => Promise.all(items.map((item) => fn(item))),
  ),
}));

import { runIncidentClassification } from "./run-classify-cli.js";
import * as aiRepo from "../repositories/ai-incident-repository.js";
import { classifyAndStoreIncident } from "./classify-incident.js";
import { findLatestCompletedRunId } from "../repositories/ingestion-run-repository.js";

const INCIDENT = {
  id: "11111111-1111-4111-8111-111111111111",
  source_incident_id: "INC-2025-118",
  severity_raw: "1",
  severity_normalised: 1,
  severity_label: "Low",
  type_code: "SLP",
  description: "Worker fell from ladder in workshop, fractured forearm.",
  source_filename: "incident_register.csv",
  source_row: 12,
};

describe("runIncidentClassification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("OPENAI_MODEL", "gpt-test");
    vi.mocked(findLatestCompletedRunId).mockResolvedValue(
      "22222222-2222-4222-8222-222222222222",
    );
    vi.mocked(aiRepo.listIncidentsForClassification).mockResolvedValue([INCIDENT]);
  });

  it("skips incidents that already have complete analysis for model/prompt version", async () => {
    vi.mocked(aiRepo.hasCompleteAnalysis).mockResolvedValue(true);

    const stats = await runIncidentClassification();

    expect(stats.skipped).toBe(1);
    expect(stats.attempted).toBe(0);
    expect(classifyAndStoreIncident).not.toHaveBeenCalled();
  });

  it("classifies only missing analyses", async () => {
    vi.mocked(aiRepo.hasCompleteAnalysis).mockResolvedValue(false);
    vi.mocked(classifyAndStoreIncident).mockResolvedValue(undefined);

    const stats = await runIncidentClassification();

    expect(stats.attempted).toBe(1);
    expect(stats.completed).toBe(1);
    expect(classifyAndStoreIncident).toHaveBeenCalledOnce();
  });
});
