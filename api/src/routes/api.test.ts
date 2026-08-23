import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("../repositories/ingestion-run-repository.js", () => ({
  findLatestCompletedRunId: vi.fn(),
}));

vi.mock("../repositories/emissions-repository.js", () => ({
  listEmissionFactors: vi.fn(),
  listIncludedFuelActivity: vi.fn(),
  listIncludedElectricityActivity: vi.fn(),
  listMonthlyFuelByType: vi.fn(),
  listMonthlyElectricity: vi.fn(),
}));

vi.mock("../repositories/incidents-repository.js", () => ({
  countIncidents: vi.fn(),
  countIncidentsBySeverity: vi.fn(),
  countIncidentsByType: vi.fn(),
  countIncidentsByMonth: vi.fn(),
  listIncidents: vi.fn(),
}));

vi.mock("../repositories/data-quality-repository.js", () => ({
  countQualityIssues: vi.fn(),
  countQualityIssuesByAction: vi.fn(),
  countQualityIssuesByCode: vi.fn(),
  countQualityIssuesBySource: vi.fn(),
  listQualityIssues: vi.fn(),
  listQualityIssuesForEntity: vi.fn(),
}));

vi.mock("../repositories/evidence-repository.js", () => ({
  findEvidenceRecord: vi.fn(),
}));

vi.mock("../services/ai-incidents-service.js", () => ({
  getAiSummary: vi.fn(),
  getIncidentsReview: vi.fn(),
  getIncidentAiStatusMap: vi.fn(),
}));

import { createApp } from "../app.js";
import { AppError } from "../errors.js";
import * as ingestionRunRepo from "../repositories/ingestion-run-repository.js";
import * as emissionsRepo from "../repositories/emissions-repository.js";
import * as incidentsRepo from "../repositories/incidents-repository.js";
import * as evidenceRepo from "../repositories/evidence-repository.js";
import * as dataQualityRepo from "../repositories/data-quality-repository.js";
import * as aiIncidentsService from "../services/ai-incidents-service.js";

const RUN_ID = "11111111-1111-4111-8111-111111111111";

describe("API routes", () => {
  const app = createApp();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ingestionRunRepo.findLatestCompletedRunId).mockResolvedValue(RUN_ID);
    vi.mocked(aiIncidentsService.getIncidentAiStatusMap).mockResolvedValue(new Map());
  });

  it("GET /health returns 200 without database access", async () => {
    const response = await request(app).get("/health");
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
    expect(ingestionRunRepo.findLatestCompletedRunId).not.toHaveBeenCalled();
  });

  it("rejects invalid data-quality action filters with 400", async () => {
    const response = await request(app).get("/api/data-quality/issues?action=deleted");
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_QUERY");
  });

  it("rejects unsupported evidence entity tables with 400", async () => {
    const response = await request(app).get(`/api/evidence/unknown_table/${RUN_ID}`);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_QUERY");
  });

  it("rejects invalid evidence UUIDs with 400", async () => {
    const response = await request(app).get("/api/evidence/fuel_deliveries/not-a-uuid");
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_QUERY");
  });

  const completeFactors = [
    {
      id: "f1",
      activity: "Diesel combustion (stationary & transport)",
      scope: 1,
      unit: "L",
      kg_co2e_per_unit: "2.7",
      factor_source: "test",
      source_filename: "emission_factors.csv",
      source_row: 2,
    },
    {
      id: "f2",
      activity: "Petrol (ULP) combustion",
      scope: 1,
      unit: "L",
      kg_co2e_per_unit: "2.31",
      factor_source: "test",
      source_filename: "emission_factors.csv",
      source_row: 3,
    },
    {
      id: "f3",
      activity: "Grid electricity - Queensland",
      scope: 2,
      unit: "kWh",
      kg_co2e_per_unit: "0.71",
      factor_source: "test",
      source_filename: "emission_factors.csv",
      source_row: 4,
    },
  ];

  it("returns structured emissions summary shape", async () => {
    vi.mocked(emissionsRepo.listEmissionFactors).mockResolvedValue(completeFactors);
    vi.mocked(emissionsRepo.listIncludedFuelActivity).mockResolvedValue([
      {
        fuel_type: "Diesel",
        quantity_litres: "100",
        reporting_month: new Date("2025-01-01T00:00:00.000Z"),
        delivery_date: new Date("2025-01-15T00:00:00.000Z"),
      },
    ]);
    vi.mocked(emissionsRepo.listIncludedElectricityActivity).mockResolvedValue([
      {
        consumption_kwh: "1000",
        period_month: new Date("2025-01-01T00:00:00.000Z"),
      },
    ]);

    const response = await request(app).get("/api/emissions/summary");
    expect(response.status).toBe(200);
    expect(response.body.ingestionRunId).toBe(RUN_ID);
    expect(response.body.scope1.emissionsKgCo2e).toBeCloseTo(270, 3);
    expect(response.body.scope2.emissionsKgCo2e).toBeCloseTo(710, 3);
    expect(response.body.combined.emissionsKgCo2e).toBeCloseTo(980, 3);
    expect(response.body.scope3.calculated).toBe(false);
    expect(response.body.units.emissions).toBe("kg CO2e");
  });

  it("returns structured HTTP 500 with EMISSIONS_DATA_INTEGRITY_ERROR for unknown fuel", async () => {
    vi.mocked(emissionsRepo.listEmissionFactors).mockResolvedValue(completeFactors);
    vi.mocked(emissionsRepo.listIncludedFuelActivity).mockResolvedValue([
      {
        fuel_type: "Biodiesel",
        quantity_litres: "10",
        reporting_month: new Date("2025-01-01T00:00:00.000Z"),
        delivery_date: new Date("2025-01-15T00:00:00.000Z"),
      },
    ]);
    vi.mocked(emissionsRepo.listIncludedElectricityActivity).mockResolvedValue([]);

    const response = await request(app).get("/api/emissions/summary");
    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe("EMISSIONS_DATA_INTEGRITY_ERROR");
    expect(response.body.error.message).toContain("Biodiesel");
    expect(JSON.stringify(response.body)).not.toMatch(/password|DATABASE_URL|stack/i);
  });

  it("returns EMISSIONS_DATA_INTEGRITY_ERROR for invalid numeric database values", async () => {
    vi.mocked(emissionsRepo.listEmissionFactors).mockResolvedValue(completeFactors);
    vi.mocked(emissionsRepo.listIncludedFuelActivity).mockResolvedValue([
      {
        fuel_type: "Diesel",
        quantity_litres: "not-a-number",
        reporting_month: new Date("2025-01-01T00:00:00.000Z"),
        delivery_date: new Date("2025-01-15T00:00:00.000Z"),
      },
    ]);
    vi.mocked(emissionsRepo.listIncludedElectricityActivity).mockResolvedValue([]);

    const response = await request(app).get("/api/emissions/summary");
    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe("EMISSIONS_DATA_INTEGRITY_ERROR");
  });

  it("represents mixed incident severity through normalised labels", async () => {
    vi.mocked(incidentsRepo.countIncidents).mockResolvedValue(3);
    vi.mocked(incidentsRepo.countIncidentsBySeverity).mockResolvedValue([
      { key: "Low", count: "1" },
      { key: "Medium", count: "1" },
      { key: "High", count: "1" },
    ]);
    vi.mocked(incidentsRepo.countIncidentsByType).mockResolvedValue([
      { key: "VEH", count: "3" },
    ]);
    vi.mocked(incidentsRepo.countIncidentsByMonth).mockResolvedValue([
      { key: "2025-01", count: "3" },
    ]);

    const response = await request(app).get("/api/incidents/summary");
    expect(response.status).toBe(200);
    expect(response.body.bySeverity).toEqual([
      { severity: "Low", count: 1 },
      { severity: "Medium", count: 1 },
      { severity: "High", count: 1 },
    ]);
    expect(response.body.trends.monthlyCounts).toHaveLength(1);
  });

  it("converts repository/service errors into safe HTTP responses", async () => {
    vi.mocked(ingestionRunRepo.findLatestCompletedRunId).mockRejectedValue(
      new AppError(503, "NO_COMPLETED_INGESTION_RUN", "No completed ingestion run"),
    );
    const response = await request(app).get("/api/emissions/summary");
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("NO_COMPLETED_INGESTION_RUN");
    expect(JSON.stringify(response.body)).not.toMatch(/password|DATABASE_URL|stack/i);
  });

  it("returns 404 for missing evidence records", async () => {
    vi.mocked(evidenceRepo.findEvidenceRecord).mockResolvedValue(null);
    const response = await request(app).get(`/api/evidence/fuel_deliveries/${RUN_ID}`);
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("EVIDENCE_NOT_FOUND");
  });

  it("returns structured data-quality summary", async () => {
    vi.mocked(dataQualityRepo.countQualityIssues).mockResolvedValue(10);
    vi.mocked(dataQualityRepo.countQualityIssuesByAction).mockResolvedValue([
      { key: "flagged", count: "10" },
    ]);
    vi.mocked(dataQualityRepo.countQualityIssuesByCode).mockResolvedValue([
      { key: "MTR07_SCALE_SHIFT", count: "9" },
    ]);
    vi.mocked(dataQualityRepo.countQualityIssuesBySource).mockResolvedValue([
      { key: "electricity_meter_readings.csv|electricity_readings", count: "9" },
    ]);

    const response = await request(app).get("/api/data-quality/summary");
    expect(response.status).toBe(200);
    expect(response.body.totalIssues).toBe(10);
    expect(response.body.ingestionRunId).toBe(RUN_ID);
  });

  it("returns honest empty AI summary when no analyses exist", async () => {
    vi.mocked(aiIncidentsService.getAiSummary).mockResolvedValue({
      ingestionRunId: RUN_ID,
      model: "gpt-test",
      promptVersion: "incident-classification-v3",
      configurationStatus: "configured",
      totalIncidents: 42,
      analysedIncidentCount: 0,
      pendingIncidentCount: 42,
      safetyCategoryCounts: [],
      psychosocialCounts: { yes: 0, no: 0, uncertain: 0, pending: 42 },
      severityCounts: {
        consistent: 0,
        possiblyInconsistent: 0,
        uncertain: 0,
        pending: 42,
      },
    });

    const response = await request(app).get("/api/ai/summary");
    expect(response.status).toBe(200);
    expect(response.body.analysedIncidentCount).toBe(0);
    expect(response.body.pendingIncidentCount).toBe(42);
    expect(response.body.safetyCategoryCounts).toEqual([]);
  });

  it("returns incidents review with source traceability fields", async () => {
    vi.mocked(aiIncidentsService.getIncidentsReview).mockResolvedValue({
      ingestionRunId: RUN_ID,
      model: "gpt-test",
      promptVersion: "incident-classification-v3",
      count: 1,
      incidents: [
        {
          id: RUN_ID,
          sourceIncidentId: "INC-2025-118",
          description: "Worker fell from ladder in workshop, fractured forearm.",
          severityRaw: "1",
          severityNormalised: 1,
          severityLabel: "Low",
          typeCode: "SLP",
          analysisStatus: "complete",
          safetyCategory: "slips_trips_and_falls",
          psychosocialAssessment: "no",
          severityAssessment: "possibly_inconsistent",
          evidence: {
            safetyCategory: "fractured forearm",
            psychosocial: "Worker fell from ladder",
            severity: "fractured forearm",
          },
          explanations: {
            safetyCategory: "May indicate a fall injury; recommended for human review.",
            psychosocial: "No psychosocial hazard described.",
            severity: "Appears potentially inconsistent with recorded Low severity.",
          },
          confidence: { safetyCategory: 0.9, psychosocial: 0.8, severity: 0.87 },
          model: "gpt-test",
          promptVersion: "incident-classification-v3",
          sourceFilename: "incident_register.csv",
          sourceRow: 12,
          requiresHumanReview: true,
        },
      ],
    });

    const response = await request(app).get("/api/incidents/review");
    expect(response.status).toBe(200);
    expect(response.body.incidents[0].sourceFilename).toBe("incident_register.csv");
    expect(response.body.incidents[0].sourceRow).toBe(12);
    expect(JSON.stringify(response.body)).not.toMatch(/password|OPENAI_API_KEY|stack/i);
  });
});
