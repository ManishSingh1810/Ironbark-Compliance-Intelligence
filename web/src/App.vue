<script setup lang="ts">
import { computed, ref } from "vue";

import { useDashboardData } from "./composables/useDashboardData.js";
import {
  countAiReviewIncidents,
  resolveAiDisplayState,
} from "./utils/aiDisplay.js";
import DashboardHeader from "./components/DashboardHeader.vue";
import DashboardSkeleton from "./components/DashboardSkeleton.vue";
import ErrorBanner from "./components/ErrorBanner.vue";
import KpiCards from "./components/KpiCards.vue";
import EmissionsChart from "./components/EmissionsChart.vue";
import MarchInsight from "./components/MarchInsight.vue";
import IncidentIntelligence from "./components/IncidentIntelligence.vue";
import DataQualityPanel from "./components/DataQualityPanel.vue";
import EvidenceDrawer from "./components/EvidenceDrawer.vue";
import type { IncidentReviewItem, QualityIssueItem } from "./api/types.js";

const {
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
  reload,
} = useDashboardData();

const drawerOpen = ref(false);
const selectedIncident = ref<IncidentReviewItem | null>(null);
const selectedIssue = ref<QualityIssueItem | null>(null);
const drawerTrigger = ref<HTMLElement | null>(null);

const aiDisplayState = computed(() =>
  resolveAiDisplayState({
    aiSummary: aiSummary.value,
    reviewIncidents: incidentsReview.value?.incidents ?? null,
    aiSummaryError: sectionErrors.value.ai,
    incidentsReviewError: sectionErrors.value.incidentsReview,
  }),
);

const aiReviewCount = computed((): number | null => {
  if (
    aiDisplayState.value === "request_failed" ||
    aiDisplayState.value === "loading" ||
    aiDisplayState.value === "pending_or_mismatch"
  ) {
    return null;
  }
  return incidentsReview.value
    ? countAiReviewIncidents(incidentsReview.value.incidents)
    : null;
});

const aiReviewDisplay = computed((): string => {
  switch (aiDisplayState.value) {
    case "loading":
      return "Loading…";
    case "request_failed":
      return "Unavailable";
    case "pending_or_mismatch":
      return "Pending";
    case "loaded_no_flags":
      return "0";
    case "loaded_with_flags":
      return aiReviewCount.value !== null
        ? aiReviewCount.value.toLocaleString("en-AU")
        : "Unavailable";
    default:
      return "Unavailable";
  }
});

const headerAnalysedCount = computed(() => {
  if (sectionErrors.value.ai || !aiSummary.value) {
    return null;
  }
  return aiSummary.value.analysedIncidentCount;
});

const headerTotalIncidents = computed(() => {
  if (aiSummary.value) {
    return aiSummary.value.totalIncidents;
  }
  return incidentsSummary.value?.totalIncidents ?? null;
});

const aiStatusNote = computed(() => {
  if (aiDisplayState.value === "request_failed") {
    return sectionErrors.value.ai ?? sectionErrors.value.incidentsReview ?? "AI request failed";
  }
  if (aiDisplayState.value === "pending_or_mismatch") {
    return "No complete analyses for the active model — check OPENAI_MODEL matches stored findings.";
  }
  return null;
});

const emissionsSummaryError = computed(() => sectionErrors.value.emissionsSummary);
const emissionsMonthlyError = computed(() => sectionErrors.value.emissionsMonthly);
const incidentsSummaryError = computed(() => sectionErrors.value.incidentsSummary);
const dataQualityError = computed(
  () => sectionErrors.value.dataQualitySummary ?? sectionErrors.value.dataQualityIssues,
);

function openIncidentEvidence(incident: IncidentReviewItem): void {
  drawerTrigger.value =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  selectedIncident.value = incident;
  selectedIssue.value = null;
  drawerOpen.value = true;
}

function openIssueEvidence(issue: QualityIssueItem): void {
  drawerTrigger.value =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  selectedIssue.value = issue;
  selectedIncident.value = null;
  drawerOpen.value = true;
}

function closeDrawer(): void {
  drawerOpen.value = false;
  selectedIncident.value = null;
  selectedIssue.value = null;
}
</script>

<template>
  <div class="min-h-screen">
    <DashboardHeader
      :api-connected="Boolean(health)"
      :analysed-count="headerAnalysedCount"
      :total-incidents="headerTotalIncidents"
      :model="aiSummary?.model ?? incidentsReview?.model ?? null"
      :prompt-version="aiSummary?.promptVersion ?? incidentsReview?.promptVersion ?? null"
      :ai-status-note="aiStatusNote"
    />

    <main class="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <DashboardSkeleton v-if="loading" />

      <ErrorBanner v-else-if="fatalError" :message="fatalError" @retry="reload" />

      <template v-else>
        <KpiCards
          :scope1-tonnes="emissionsSummary?.scope1.emissionsTonnesCo2e ?? null"
          :scope2-tonnes="emissionsSummary?.scope2.emissionsTonnesCo2e ?? null"
          :combined-tonnes="emissionsSummary?.combined.emissionsTonnesCo2e ?? null"
          :total-incidents="incidentsSummary?.totalIncidents ?? null"
          :data-quality-issues="dataQualitySummary?.totalIssues ?? null"
          :ai-review-count="aiReviewCount"
          :ai-review-display="aiReviewDisplay"
        />
        <p
          v-if="emissionsSummaryError"
          class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          Emissions summary unavailable: {{ emissionsSummaryError }}
        </p>

        <EmissionsChart
          :monthly="emissionsMonthly"
          :error="emissionsMonthlyError"
        />

        <MarchInsight
          :monthly="emissionsMonthly"
          :incidents="incidentsReview?.incidents ?? []"
          @open-evidence="openIncidentEvidence"
        />

        <IncidentIntelligence
          :incidents-summary="incidentsSummary"
          :ai-summary="aiSummary"
          :review-incidents="incidentsReview?.incidents ?? []"
          :incidents-summary-error="incidentsSummaryError"
          :ai-display-state="aiDisplayState"
          :ai-error-message="sectionErrors.ai ?? sectionErrors.incidentsReview"
          @open-evidence="openIncidentEvidence"
        />

        <DataQualityPanel
          :summary="dataQualitySummary"
          :issues="dataQualityIssues"
          :emissions-caveats="emissionsSummary?.dataQualityCaveats ?? null"
          :error="dataQualityError"
          @open-issue="openIssueEvidence"
        />
      </template>
    </main>

    <EvidenceDrawer
      :open="drawerOpen"
      :incident="selectedIncident"
      :issue="selectedIssue"
      :return-focus-to="drawerTrigger"
      @close="closeDrawer"
    />
  </div>
</template>
