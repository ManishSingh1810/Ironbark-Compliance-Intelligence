import type {
  AiSummaryResponse,
  ApiErrorBody,
  DataQualityIssuesResponse,
  DataQualitySummaryResponse,
  EmissionsSummaryResponse,
  EvidenceResponse,
  HealthResponse,
  IncidentsReviewResponse,
  IncidentsSummaryResponse,
  MonthlyEmissionsResponse,
} from "./types.js";
import { ApiRequestError } from "./types.js";

export function getApiBaseUrl(): string {
  return import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";
}

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) {
    return {} as T;
  }
  return JSON.parse(text) as T;
}

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const url = `${getApiBaseUrl()}${path}`;
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal,
  });

  if (!response.ok) {
    const body = await parseJson<ApiErrorBody>(response);
    throw new ApiRequestError(
      response.status,
      body.error?.code ?? "REQUEST_FAILED",
      body.error?.message ?? `Request failed with status ${response.status}`,
    );
  }

  return parseJson<T>(response);
}

export const api = {
  health: (signal?: AbortSignal) => apiGet<HealthResponse>("/health", signal),
  emissionsSummary: (signal?: AbortSignal) =>
    apiGet<EmissionsSummaryResponse>("/api/emissions/summary", signal),
  emissionsMonthly: (signal?: AbortSignal) =>
    apiGet<MonthlyEmissionsResponse>("/api/emissions/monthly", signal),
  incidentsSummary: (signal?: AbortSignal) =>
    apiGet<IncidentsSummaryResponse>("/api/incidents/summary", signal),
  incidentsReview: (signal?: AbortSignal) =>
    apiGet<IncidentsReviewResponse>("/api/incidents/review", signal),
  aiSummary: (signal?: AbortSignal) => apiGet<AiSummaryResponse>("/api/ai/summary", signal),
  dataQualitySummary: (signal?: AbortSignal) =>
    apiGet<DataQualitySummaryResponse>("/api/data-quality/summary", signal),
  dataQualityIssues: (signal?: AbortSignal) =>
    apiGet<DataQualityIssuesResponse>("/api/data-quality/issues", signal),
  evidence: (entityTable: string, entityId: string, signal?: AbortSignal) =>
    apiGet<EvidenceResponse>(`/api/evidence/${entityTable}/${entityId}`, signal),
};
