import { onMounted, onUnmounted, ref, shallowRef } from "vue";

import { api } from "../api/client.js";
import type {
  AiSummaryResponse,
  DataQualityIssuesResponse,
  DataQualitySummaryResponse,
  EmissionsSummaryResponse,
  HealthResponse,
  IncidentsReviewResponse,
  IncidentsSummaryResponse,
  MonthlyEmissionsResponse,
} from "../api/types.js";
import { ApiRequestError } from "../api/types.js";

export interface SectionErrors {
  emissionsSummary?: string;
  emissionsMonthly?: string;
  incidentsSummary?: string;
  incidentsReview?: string;
  ai?: string;
  dataQualitySummary?: string;
  dataQualityIssues?: string;
}

export function useDashboardData() {
  const loading = ref(true);
  const fatalError = ref<string | null>(null);
  const sectionErrors = ref<SectionErrors>({});

  const health = shallowRef<HealthResponse | null>(null);
  const emissionsSummary = shallowRef<EmissionsSummaryResponse | null>(null);
  const emissionsMonthly = shallowRef<MonthlyEmissionsResponse | null>(null);
  const incidentsSummary = shallowRef<IncidentsSummaryResponse | null>(null);
  const incidentsReview = shallowRef<IncidentsReviewResponse | null>(null);
  const aiSummary = shallowRef<AiSummaryResponse | null>(null);
  const dataQualitySummary = shallowRef<DataQualitySummaryResponse | null>(null);
  const dataQualityIssues = shallowRef<DataQualityIssuesResponse | null>(null);

  let abortController: AbortController | null = null;
  let mounted = true;

  async function loadSection<T>(
    key: keyof SectionErrors,
    fetcher: () => Promise<T>,
    assign: (value: T) => void,
  ): Promise<void> {
    try {
      const value = await fetcher();
      if (!mounted) {
        return;
      }
      assign(value);
      delete sectionErrors.value[key];
    } catch (error) {
      if (!mounted) {
        return;
      }
      if (error instanceof ApiRequestError) {
        sectionErrors.value[key] = error.message;
      } else if (error instanceof Error && error.name === "AbortError") {
        return;
      } else {
        sectionErrors.value[key] = "Unexpected error loading section.";
      }
    }
  }

  async function load(): Promise<void> {
    abortController?.abort();
    abortController = new AbortController();
    const signal = abortController.signal;

    loading.value = true;
    fatalError.value = null;
    sectionErrors.value = {};

    try {
      health.value = await api.health(signal);
    } catch (error) {
      if (!mounted || (error instanceof Error && error.name === "AbortError")) {
        return;
      }
      fatalError.value =
        error instanceof ApiRequestError
          ? `Cannot reach API: ${error.message}`
          : "Cannot reach API. Check that the server is running.";
      loading.value = false;
      return;
    }

    await Promise.all([
      loadSection("emissionsSummary", () => api.emissionsSummary(signal), (v) => {
        emissionsSummary.value = v;
      }),
      loadSection("emissionsMonthly", () => api.emissionsMonthly(signal), (v) => {
        emissionsMonthly.value = v;
      }),
      loadSection("incidentsSummary", () => api.incidentsSummary(signal), (v) => {
        incidentsSummary.value = v;
      }),
      loadSection("incidentsReview", () => api.incidentsReview(signal), (v) => {
        incidentsReview.value = v;
      }),
      loadSection("ai", () => api.aiSummary(signal), (v) => {
        aiSummary.value = v;
      }),
      loadSection("dataQualitySummary", () => api.dataQualitySummary(signal), (v) => {
        dataQualitySummary.value = v;
      }),
      loadSection("dataQualityIssues", () => api.dataQualityIssues(signal), (v) => {
        dataQualityIssues.value = v;
      }),
    ]);

    if (mounted) {
      loading.value = false;
    }
  }

  onMounted(() => {
    mounted = true;
    void load();
  });

  onUnmounted(() => {
    mounted = false;
    abortController?.abort();
  });

  return {
    loading,
    fatalError,
    sectionErrors,
    health,
    emissionsSummary,
    emissionsMonthly,
    incidentsSummary,
    incidentsReview,
    aiSummary,
    dataQualitySummary,
    dataQualityIssues,
    reload: load,
  };
}
