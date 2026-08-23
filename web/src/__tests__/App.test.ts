import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

import App from "../App.vue";
import {
  ANALYSIS_COMPLETE,
  PSYCHOSOCIAL_YES,
  SEVERITY_POSSIBLY_INCONSISTENT,
} from "../utils/aiDisplay.js";

const emissionsSummary = {
  ingestionRunId: "run-1",
  units: {
    activityFuel: "litres",
    activityElectricity: "kWh",
    emissions: "kg CO2e",
    emissionsTonnes: "t CO2e",
  },
  scope1: { activityLitres: 1, emissionsKgCo2e: 1, emissionsTonnesCo2e: 22052.5 },
  scope2: { activityKwh: 1, emissionsKgCo2e: 1, emissionsTonnesCo2e: 23333.2 },
  combined: { emissionsKgCo2e: 2, emissionsTonnesCo2e: 45385.7 },
  factorsUsed: [],
  factorMatching: { fuelTypeToActivity: {}, electricityActivity: "Grid electricity - Queensland" },
  scope3: { calculated: false, reason: "not calculated" },
  dataQualityCaveats: ["Exact duplicate fuel deliveries are excluded from Scope 1."],
};

const monthly = {
  ingestionRunId: "run-1",
  units: { emissions: "kg CO2e", emissionsTonnes: "t CO2e" },
  months: [
    {
      month: "2026-02",
      scope1KgCo2e: 1000,
      scope2KgCo2e: 1000,
      totalKgCo2e: 2000,
      scope1TonnesCo2e: 1,
      scope2TonnesCo2e: 1,
      totalTonnesCo2e: 2,
    },
    {
      month: "2026-03",
      scope1KgCo2e: 1450,
      scope2KgCo2e: 365,
      totalKgCo2e: 1815,
      scope1TonnesCo2e: 1.45,
      scope2TonnesCo2e: 0.365,
      totalTonnesCo2e: 1.815,
    },
  ],
};

const incidentsSummary = {
  ingestionRunId: "run-1",
  totalIncidents: 42,
  bySeverity: [{ severity: "Low", count: 20 }],
  byTypeCode: [{ typeCode: "VEH", count: 10 }],
  byMonth: [{ month: "2025-01", count: 3 }],
  trends: {
    monthlyCounts: [{ month: "2025-01", count: 3 }],
    severityCounts: [{ severity: "Low", count: 20 }],
  },
};

function makeReview(
  sourceIncidentId: string,
  psychosocialAssessment: string,
  severityAssessment: string,
  extras: Record<string, unknown> = {},
) {
  return {
    id: extras.id ?? `11111111-1111-4111-8111-${sourceIncidentId.slice(-12).padStart(12, "0")}`,
    sourceIncidentId,
    description: extras.description ?? `${sourceIncidentId} description`,
    severityRaw: "1",
    severityNormalised: 1,
    severityLabel: "Low",
    typeCode: "OTH",
    analysisStatus: ANALYSIS_COMPLETE,
    safetyCategory: "psychosocial",
    psychosocialAssessment,
    severityAssessment,
    evidence: {
      safetyCategory: "excerpt",
      psychosocial: psychosocialAssessment === PSYCHOSOCIAL_YES ? "stress" : null,
      severity: severityAssessment === SEVERITY_POSSIBLY_INCONSISTENT ? "injury" : null,
    },
    explanations: {
      safetyCategory: "cat",
      psychosocial: "psy",
      severity: "sev",
    },
    confidence: { safetyCategory: 0.9, psychosocial: 0.9, severity: 0.9 },
    model: "gpt-4o-mini",
    promptVersion: "incident-classification-v3",
    sourceFilename: "incident_register.csv",
    sourceRow: 10,
    requiresHumanReview: true,
    ...extras,
  };
}

const reviewIncidents = [
  makeReview("INC-2025-127", PSYCHOSOCIAL_YES, SEVERITY_POSSIBLY_INCONSISTENT),
  makeReview("INC-2025-152", PSYCHOSOCIAL_YES, SEVERITY_POSSIBLY_INCONSISTENT),
  makeReview("INC-2026-109", PSYCHOSOCIAL_YES, SEVERITY_POSSIBLY_INCONSISTENT),
  makeReview("INC-2025-118", "no", SEVERITY_POSSIBLY_INCONSISTENT),
  makeReview("INC-2025-141", "no", SEVERITY_POSSIBLY_INCONSISTENT),
  makeReview("INC-2026-029", "no", SEVERITY_POSSIBLY_INCONSISTENT),
  makeReview("INC-2026-134", "no", SEVERITY_POSSIBLY_INCONSISTENT, {
    description: "Multiple crews reporting fatigue after extended shifts.",
  }),
  makeReview("INC-2026-131", "no", "consistent", {
    description: "Regional substation failure caused loss of grid supply to site.",
    typeCode: "ELE",
    severityLabel: "High",
  }),
];

const incidentsReview = {
  ingestionRunId: "run-1",
  model: "gpt-4o-mini",
  promptVersion: "incident-classification-v3",
  count: reviewIncidents.length,
  incidents: reviewIncidents,
};

const aiSummary = {
  ingestionRunId: "run-1",
  model: "gpt-4o-mini",
  promptVersion: "incident-classification-v3",
  configurationStatus: "configured",
  totalIncidents: 42,
  analysedIncidentCount: 42,
  pendingIncidentCount: 0,
  safetyCategoryCounts: [
    { category: "psychosocial", count: 3 },
    { category: "electrical", count: 1 },
  ],
  psychosocialCounts: { yes: 3, no: 39, uncertain: 0, pending: 0 },
  severityCounts: {
    consistent: 35,
    possiblyInconsistent: 7,
    uncertain: 0,
    pending: 0,
  },
};

const dataQualitySummary = {
  ingestionRunId: "run-1",
  totalIssues: 71,
  byAction: [
    { action: "fixed", count: 3 },
    { action: "flagged", count: 61 },
    { action: "rejected", count: 7 },
  ],
  byIssueCode: [
    { issueCode: "MONTH_ONLY_DATE", count: 29 },
    { issueCode: "MTR07_SCALE_SHIFT", count: 9 },
    { issueCode: "EXACT_DUPLICATE", count: 7 },
    { issueCode: "FUEL_MONTH_GAP", count: 1 },
    { issueCode: "SITE_ELECTRICITY_DROP", count: 1 },
  ],
  bySource: [],
};

const dataQualityIssues = {
  ingestionRunId: "run-1",
  count: 12,
  issues: Array.from({ length: 12 }, (_, index) => ({
    id: `issue-${index}`,
    action: index === 0 ? "rejected" : "flagged",
    issueCode: index === 1 ? "FUEL_MONTH_GAP" : index === 2 ? "MTR07_SCALE_SHIFT" : "MONTH_ONLY_DATE",
    explanation: `Issue explanation ${index}`,
    originalValue: null,
    cleanedValue: null,
    sourceFilename: "fuel_deliveries.csv",
    sourceRow: index === 1 ? null : 10 + index,
    entityTable: "fuel_deliveries",
    entityId: index === 1 ? null : "22222222-2222-4222-8222-222222222222",
    createdAt: "2026-01-01T00:00:00.000Z",
  })),
};

function mockFetch(overrides: Record<string, unknown> = {}): void {
  const payloads: Record<string, unknown> = {
    "/health": { status: "ok", service: "ironbark-api", timestamp: "2026-01-01T00:00:00.000Z" },
    "/api/emissions/summary": emissionsSummary,
    "/api/emissions/monthly": monthly,
    "/api/incidents/summary": incidentsSummary,
    "/api/incidents/review": incidentsReview,
    "/api/ai/summary": aiSummary,
    "/api/data-quality/summary": dataQualitySummary,
    "/api/data-quality/issues": dataQualityIssues,
    ...overrides,
  };

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      const url = String(input);
      if (url.includes("/api/evidence/")) {
        return {
          ok: true,
          text: async () =>
            JSON.stringify({
              ingestionRunId: "run-1",
              entityTable: "incidents",
              entityId: "11111111-1111-4111-8111-111111111111",
              sourceFilename: "incident_register.csv",
              sourceRow: 31,
              record: { description: "evidence description" },
              qualityIssues: [],
            }),
        } as Response;
      }

      const key = Object.keys(payloads).find((path) => url.includes(path));
      const body = key ? payloads[key] : {};
      return {
        ok: true,
        text: async () => JSON.stringify(body),
      } as Response;
    }),
  );
}

describe("App dashboard AI regression", () => {
  beforeEach(() => {
    mockFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders 42/42 analysed and full gpt-4o-mini model from real-shaped AI summary", async () => {
    const wrapper = mount(App);
    await flushPromises();

    expect(wrapper.text()).toContain("42/42 analysed");
    expect(wrapper.text()).toContain("gpt-4o-mini");
    expect(wrapper.text()).toContain("incident-classification-v3");
    expect(wrapper.text()).not.toContain("gpt-4o- ·");
  });

  it("renders three psychosocial findings and AI review queue of 7", async () => {
    const wrapper = mount(App);
    await flushPromises();

    expect(wrapper.text()).toContain("Psychosocial findings (3)");
    expect(wrapper.text()).toContain("INC-2025-127");
    expect(wrapper.text()).toContain("INC-2025-152");
    expect(wrapper.text()).toContain("INC-2026-109");
    expect(wrapper.text()).toContain("Possible severity inconsistencies (7)");
    expect(wrapper.text()).toMatch(/AI review queue[\s\S]*\b7\b/);
  });

  it("does not display AI review queue as 0 when model mismatch leaves analyses pending", async () => {
    mockFetch({
      "/api/ai/summary": {
        ...aiSummary,
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
      "/api/incidents/review": {
        ...incidentsReview,
        model: "gpt-4o-",
        incidents: incidentsReview.incidents.map((incident) => ({
          ...incident,
          analysisStatus: "pending",
          psychosocialAssessment: null,
          severityAssessment: null,
          safetyCategory: null,
        })),
      },
    });

    const wrapper = mount(App);
    await flushPromises();

    const aiReviewCard = wrapper
      .findAll("article")
      .find((card) => card.text().includes("AI review queue"));
    expect(aiReviewCard).toBeTruthy();
    expect(aiReviewCard!.find("p.text-2xl").text()).toBe("Pending");
    expect(wrapper.text()).toContain(
      "No complete analyses for the active model",
    );
  });

  it("does not render misleading zero findings when AI request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) => {
        const url = String(input);
        if (url.includes("/health")) {
          return {
            ok: true,
            text: async () =>
              JSON.stringify({
                status: "ok",
                service: "ironbark-api",
                timestamp: "2026-01-01T00:00:00.000Z",
              }),
          } as Response;
        }
        if (url.includes("/api/ai/summary") || url.includes("/api/incidents/review")) {
          return {
            ok: false,
            status: 500,
            text: async () =>
              JSON.stringify({
                error: { code: "INTERNAL_ERROR", message: "AI unavailable" },
              }),
          } as Response;
        }
        if (url.includes("/api/emissions/summary")) {
          return { ok: true, text: async () => JSON.stringify(emissionsSummary) } as Response;
        }
        if (url.includes("/api/emissions/monthly")) {
          return { ok: true, text: async () => JSON.stringify(monthly) } as Response;
        }
        if (url.includes("/api/incidents/summary")) {
          return { ok: true, text: async () => JSON.stringify(incidentsSummary) } as Response;
        }
        if (url.includes("/api/data-quality/summary")) {
          return { ok: true, text: async () => JSON.stringify(dataQualitySummary) } as Response;
        }
        if (url.includes("/api/data-quality/issues")) {
          return { ok: true, text: async () => JSON.stringify(dataQualityIssues) } as Response;
        }
        return { ok: true, text: async () => "{}" } as Response;
      }),
    );

    const wrapper = mount(App);
    await flushPromises();

    expect(wrapper.text()).toContain("AI findings could not be loaded");
    expect(wrapper.text()).not.toContain("Psychosocial findings (0)");
    expect(wrapper.text()).not.toContain("No psychosocial hazards flagged by AI");
    expect(wrapper.text()).toContain("Unavailable");
    expect(wrapper.text()).toContain("status unavailable");
  });

  it("limits data-quality issue list and offers show more", async () => {
    const wrapper = mount(App);
    await flushPromises();

    expect(wrapper.text()).toContain("Showing 8 of 12 matching issues");
    expect(wrapper.text()).toContain("Show more (4 remaining)");
    const showMore = wrapper.findAll("button").find((btn) => btn.text().includes("Show more"));
    await showMore!.trigger("click");
    expect(wrapper.text()).toContain("Showing 12 of 12 matching issues");
  });

  it("opens evidence for March incidents with full AI fields in drawer", async () => {
    const wrapper = mount(App);
    await flushPromises();

    const psychoButton = wrapper
      .findAll("button")
      .find((btn) => btn.text().includes("INC-2025-127"));
    await psychoButton!.trigger("click");
    await flushPromises();

    expect(document.body.textContent).toContain("Source evidence");
    expect(document.body.textContent).toContain("Psychosocial assessment");
    expect(document.body.textContent).toContain("Severity assessment");
    expect(document.body.textContent).toContain("Human review required");

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await flushPromises();
    expect(document.body.textContent).not.toContain("Psychosocial assessment");
  });
});
