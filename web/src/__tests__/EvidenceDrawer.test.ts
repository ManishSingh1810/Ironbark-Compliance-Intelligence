import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

import EvidenceDrawer from "../components/EvidenceDrawer.vue";
import type { IncidentReviewItem } from "../api/types.js";
import {
  ANALYSIS_COMPLETE,
  PSYCHOSOCIAL_YES,
  SEVERITY_POSSIBLY_INCONSISTENT,
} from "../utils/aiDisplay.js";

const completeIncident: IncidentReviewItem = {
  id: "11111111-1111-4111-8111-111111111111",
  sourceIncidentId: "INC-2025-127",
  description: "Operator raised concerns about repeated verbal abuse from supervisor.",
  severityRaw: "1",
  severityNormalised: 1,
  severityLabel: "Low",
  typeCode: "OTH",
  analysisStatus: ANALYSIS_COMPLETE,
  safetyCategory: "psychosocial",
  psychosocialAssessment: PSYCHOSOCIAL_YES,
  severityAssessment: SEVERITY_POSSIBLY_INCONSISTENT,
  evidence: {
    safetyCategory: "repeated verbal abuse from supervisor",
    psychosocial: "repeated verbal abuse from supervisor",
    severity: "feeling anxious before shift",
  },
  explanations: {
    safetyCategory: "Category explanation.",
    psychosocial: "Psychosocial explanation.",
    severity: "Severity explanation.",
  },
  confidence: { safetyCategory: 0.9, psychosocial: 0.95, severity: 0.85 },
  model: "gpt-4o-mini",
  promptVersion: "incident-classification-v3",
  sourceFilename: "incident_register.csv",
  sourceRow: 16,
  requiresHumanReview: true,
};

describe("EvidenceDrawer", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        text: async () =>
          JSON.stringify({
            ingestionRunId: "run-1",
            entityTable: "incidents",
            entityId: completeIncident.id,
            sourceFilename: "incident_register.csv",
            sourceRow: 16,
            record: { description: completeIncident.description },
            qualityIssues: [],
          }),
      })) as unknown as typeof fetch,
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows all three AI finding groups with evidence, explanation and confidence", async () => {
    mount(EvidenceDrawer, {
      props: {
        open: true,
        incident: completeIncident,
        issue: null,
      },
      attachTo: document.body,
    });
    await flushPromises();

    const text = document.body.textContent ?? "";
    expect(text).toContain("Safety category");
    expect(text).toContain("Psychosocial assessment");
    expect(text).toContain("Severity assessment");
    expect(text).toContain("repeated verbal abuse from supervisor");
    expect(text).toContain("feeling anxious before shift");
    expect(text).toContain("Psychosocial explanation.");
    expect(text).toContain("Severity explanation.");
    expect(text).toContain("95%");
    expect(text).toContain("85%");
    expect(text).toContain("Human review required");
    expect(text).toContain("gpt-4o-mini");
    expect(text).toContain("incident-classification-v3");
  });

  it("closes on Escape and returns focus to the trigger element", async () => {
    const trigger = document.createElement("button");
    trigger.textContent = "Open evidence";
    document.body.appendChild(trigger);
    trigger.focus();

    const wrapper = mount(EvidenceDrawer, {
      props: {
        open: true,
        incident: completeIncident,
        issue: null,
        returnFocusTo: trigger,
      },
      attachTo: document.body,
    });
    await flushPromises();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await flushPromises();

    expect(wrapper.emitted("close")).toBeTruthy();
    expect(document.activeElement).toBe(trigger);

    trigger.remove();
  });
});
