export interface HealthResponse {
  status: string;
  service: string;
  timestamp: string;
}

export interface EmissionsSummaryResponse {
  ingestionRunId: string;
  units: {
    activityFuel: string;
    activityElectricity: string;
    emissions: string;
    emissionsTonnes: string;
  };
  scope1: {
    activityLitres: number;
    emissionsKgCo2e: number;
    emissionsTonnesCo2e: number;
  };
  scope2: {
    activityKwh: number;
    emissionsKgCo2e: number;
    emissionsTonnesCo2e: number;
  };
  combined: {
    emissionsKgCo2e: number;
    emissionsTonnesCo2e: number;
  };
  factorsUsed: Array<{
    activity: string;
    scope: number;
    unit: string;
    kgCo2ePerUnit: number;
    factorSource: string;
    sourceFilename: string;
    sourceRow: number;
  }>;
  factorMatching: {
    fuelTypeToActivity: Record<string, string>;
    electricityActivity: string;
  };
  scope3: {
    calculated: boolean;
    reason: string;
  };
  dataQualityCaveats: string[];
}

export interface MonthlyEmissionsResponse {
  ingestionRunId: string;
  units: {
    emissions: string;
    emissionsTonnes: string;
  };
  months: Array<{
    month: string;
    scope1KgCo2e: number;
    scope2KgCo2e: number;
    totalKgCo2e: number;
    scope1TonnesCo2e: number;
    scope2TonnesCo2e: number;
    totalTonnesCo2e: number;
  }>;
}

export interface IncidentsSummaryResponse {
  ingestionRunId: string;
  totalIncidents: number;
  bySeverity: Array<{ severity: string; count: number }>;
  byTypeCode: Array<{ typeCode: string; count: number }>;
  byMonth: Array<{ month: string; count: number }>;
  trends: {
    monthlyCounts: Array<{ month: string; count: number }>;
    severityCounts: Array<{ severity: string; count: number }>;
  };
}

export interface IncidentReviewItem {
  id: string;
  sourceIncidentId: string;
  description: string;
  severityRaw: string;
  severityNormalised: number | null;
  severityLabel: string | null;
  typeCode: string;
  analysisStatus: "complete" | "partial" | "pending";
  safetyCategory: string | null;
  psychosocialAssessment: string | null;
  severityAssessment: string | null;
  evidence: {
    safetyCategory: string | null;
    psychosocial: string | null;
    severity: string | null;
  };
  explanations: {
    safetyCategory: string | null;
    psychosocial: string | null;
    severity: string | null;
  };
  confidence: {
    safetyCategory: number | null;
    psychosocial: number | null;
    severity: number | null;
  };
  model: string | null;
  promptVersion: string | null;
  sourceFilename: string;
  sourceRow: number;
  requiresHumanReview: boolean;
}

export interface IncidentsReviewResponse {
  ingestionRunId: string;
  model: string | null;
  promptVersion: string | null;
  count: number;
  incidents: IncidentReviewItem[];
}

export interface AiSummaryResponse {
  ingestionRunId: string;
  model: string | null;
  promptVersion: string;
  configurationStatus: string;
  totalIncidents: number;
  analysedIncidentCount: number;
  pendingIncidentCount: number;
  safetyCategoryCounts: Array<{ category: string; count: number }>;
  psychosocialCounts: {
    yes: number;
    no: number;
    uncertain: number;
    pending: number;
  };
  severityCounts: {
    consistent: number;
    possiblyInconsistent: number;
    uncertain: number;
    pending: number;
  };
}

export interface DataQualitySummaryResponse {
  ingestionRunId: string;
  totalIssues: number;
  byAction: Array<{ action: string; count: number }>;
  byIssueCode: Array<{ issueCode: string; count: number }>;
  bySource: Array<{
    sourceFilename: string;
    entityTable: string;
    count: number;
  }>;
}

export interface QualityIssueItem {
  id: string;
  action: string;
  issueCode: string;
  explanation: string;
  originalValue: string | null;
  cleanedValue: string | null;
  sourceFilename: string;
  sourceRow: number | null;
  entityTable: string;
  entityId: string | null;
  createdAt: string;
}

export interface DataQualityIssuesResponse {
  ingestionRunId: string;
  count: number;
  issues: QualityIssueItem[];
}

export interface EvidenceResponse {
  ingestionRunId: string;
  entityTable: string;
  entityId: string;
  sourceFilename: string;
  sourceRow: number;
  record: Record<string, unknown>;
  qualityIssues: Array<{
    id: string;
    action: string;
    issueCode: string;
    explanation: string;
    originalValue: string | null;
    cleanedValue: string | null;
    sourceFilename: string;
    sourceRow: number | null;
    createdAt: string;
  }>;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
  }
}
