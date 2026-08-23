import { describe, expect, it } from "vitest";

import type { MonthlyEmissionsResponse } from "../api/types.js";
import { computeMarchActivityShift, countAiReviewIncidents } from "../utils/marchInsight.js";
import {
  PSYCHOSOCIAL_YES,
  SEVERITY_POSSIBLY_INCONSISTENT,
} from "../utils/aiDisplay.js";

const monthlyFixture: MonthlyEmissionsResponse = {
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

describe("march insight utilities", () => {
  it("computes March activity shift from monthly API values", () => {
    const shift = computeMarchActivityShift(monthlyFixture);
    expect(shift).not.toBeNull();
    expect(shift!.scope1ChangeLabel).toBe("+45.0%");
    expect(shift!.scope2ChangeLabel).toBe("-63.5%");
    expect(shift!.derivedFrom).toContain("Feb 2026");
  });

  it("counts unique AI review incidents without double-counting overlap", () => {
    const count = countAiReviewIncidents([
      {
        psychosocialAssessment: PSYCHOSOCIAL_YES,
        severityAssessment: SEVERITY_POSSIBLY_INCONSISTENT,
      },
      {
        psychosocialAssessment: "no",
        severityAssessment: SEVERITY_POSSIBLY_INCONSISTENT,
      },
      { psychosocialAssessment: "no", severityAssessment: "consistent" },
    ]);
    expect(count).toBe(2);
  });
});
