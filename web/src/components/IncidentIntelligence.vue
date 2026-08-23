<script setup lang="ts">
import { computed } from "vue";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar } from "vue-chartjs";

import type {
  AiSummaryResponse,
  IncidentReviewItem,
  IncidentsSummaryResponse,
} from "../api/types.js";
import {
  ANALYSIS_COMPLETE,
  PSYCHOSOCIAL_YES,
  SEVERITY_POSSIBLY_INCONSISTENT,
  type AiDisplayState,
} from "../utils/aiDisplay.js";
import { formatCategoryLabel, formatMonthLabel } from "../utils/format.js";
import IncidentFindingCard from "./IncidentFindingCard.vue";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

const props = defineProps<{
  incidentsSummary: IncidentsSummaryResponse | null;
  aiSummary: AiSummaryResponse | null;
  reviewIncidents: IncidentReviewItem[];
  incidentsSummaryError?: string;
  aiDisplayState: AiDisplayState;
  aiErrorMessage?: string;
}>();

const emit = defineEmits<{
  openEvidence: [incident: IncidentReviewItem];
}>();

const trendChart = computed(() => {
  if (!props.incidentsSummary) {
    return null;
  }
  return {
    labels: props.incidentsSummary.trends.monthlyCounts.map((m) =>
      formatMonthLabel(m.month),
    ),
    datasets: [
      {
        label: "Incidents",
        data: props.incidentsSummary.trends.monthlyCounts.map((m) => m.count),
        backgroundColor: "#0d9488",
      },
    ],
  };
});

const severityChart = computed(() => {
  if (!props.incidentsSummary) {
    return null;
  }
  return {
    labels: props.incidentsSummary.bySeverity.map((s) => s.severity),
    datasets: [
      {
        label: "By severity",
        data: props.incidentsSummary.bySeverity.map((s) => s.count),
        backgroundColor: ["#64748b", "#d97706", "#dc2626"],
      },
    ],
  };
});

const categoryChart = computed(() => {
  if (!props.aiSummary?.safetyCategoryCounts.length) {
    return null;
  }
  return {
    labels: props.aiSummary.safetyCategoryCounts.map((c) =>
      formatCategoryLabel(c.category),
    ),
    datasets: [
      {
        label: "AI safety category",
        data: props.aiSummary.safetyCategoryCounts.map((c) => c.count),
        backgroundColor: "#1e40af",
      },
    ],
  };
});

const psychosocialFindings = computed(() =>
  props.reviewIncidents.filter(
    (i) =>
      i.psychosocialAssessment === PSYCHOSOCIAL_YES &&
      i.analysisStatus === ANALYSIS_COMPLETE,
  ),
);

const severityFindings = computed(() =>
  props.reviewIncidents.filter(
    (i) =>
      i.severityAssessment === SEVERITY_POSSIBLY_INCONSISTENT &&
      i.analysisStatus === ANALYSIS_COMPLETE,
  ),
);

const showAiFindings = computed(
  () =>
    props.aiDisplayState === "loaded_with_flags" ||
    props.aiDisplayState === "loaded_no_flags",
);

const barOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
};
</script>

<template>
  <section aria-labelledby="incident-intel-heading" class="space-y-6">
    <div>
      <h2 id="incident-intel-heading" class="text-lg font-semibold text-navy-900">
        Incident intelligence
      </h2>
      <p class="text-sm text-muted">
        Recorded incidents with AI-assisted review findings. All AI outputs require human
        review.
      </p>
    </div>

    <p
      v-if="incidentsSummaryError"
      class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
    >
      Incident summary unavailable: {{ incidentsSummaryError }}
    </p>

    <div v-else class="grid gap-4 lg:grid-cols-3">
      <div class="rounded-xl border border-border bg-card p-4 lg:col-span-2">
        <h3 class="mb-3 text-sm font-semibold">Incident trend by month</h3>
        <div v-if="trendChart" class="h-56">
          <Bar :data="trendChart" :options="barOptions" />
        </div>
      </div>
      <div class="rounded-xl border border-border bg-card p-4">
        <h3 class="mb-3 text-sm font-semibold">By recorded severity</h3>
        <div v-if="severityChart" class="h-56">
          <Bar :data="severityChart" :options="barOptions" />
        </div>
      </div>
    </div>

    <p
      v-if="aiDisplayState === 'request_failed'"
      class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
      role="alert"
    >
      AI findings could not be loaded
      <span v-if="aiErrorMessage">: {{ aiErrorMessage }}</span>.
      Counts below are not shown as zero — retry after the API recovers.
    </p>

    <p
      v-else-if="aiDisplayState === 'pending_or_mismatch'"
      class="rounded-md border border-amber-500/40 bg-amber-100/50 px-3 py-2 text-sm text-amber-800"
      role="status"
    >
      No complete analyses for the active model ({{ aiSummary?.model ?? "unknown" }}) and
      prompt ({{ aiSummary?.promptVersion }}). All {{ aiSummary?.totalIncidents }} incidents
      are pending. If a live classification already ran, check that
      <code class="rounded bg-white px-1">OPENAI_MODEL</code> matches the stored findings
      model.
    </p>

    <template v-else-if="showAiFindings">
      <div v-if="categoryChart" class="rounded-xl border border-border bg-card p-4">
        <h3 class="mb-3 text-sm font-semibold">AI safety-category breakdown</h3>
        <div class="h-64">
          <Bar :data="categoryChart" :options="{ ...barOptions, indexAxis: 'y' as const }" />
        </div>
      </div>

      <div class="grid gap-6 lg:grid-cols-2">
        <div>
          <h3 class="mb-3 text-sm font-semibold text-navy-900">
            Psychosocial findings ({{ psychosocialFindings.length }})
          </h3>
          <ul v-if="psychosocialFindings.length" class="space-y-3">
            <li v-for="incident in psychosocialFindings" :key="incident.id">
              <IncidentFindingCard
                :incident="incident"
                @open="emit('openEvidence', incident)"
              />
            </li>
          </ul>
          <p v-else class="text-sm text-muted">
            AI analysed {{ aiSummary?.analysedIncidentCount ?? 0 }} incidents and flagged no
            psychosocial hazards.
          </p>
        </div>

        <div>
          <h3 class="mb-3 text-sm font-semibold text-navy-900">
            Possible severity inconsistencies ({{ severityFindings.length }})
          </h3>
          <ul v-if="severityFindings.length" class="space-y-3">
            <li v-for="incident in severityFindings" :key="incident.id">
              <IncidentFindingCard
                :incident="incident"
                @open="emit('openEvidence', incident)"
              />
            </li>
          </ul>
          <p v-else class="text-sm text-muted">
            AI analysed {{ aiSummary?.analysedIncidentCount ?? 0 }} incidents and flagged no
            severity inconsistencies.
          </p>
        </div>
      </div>
    </template>
  </section>
</template>
