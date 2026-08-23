<script setup lang="ts">
import { computed } from "vue";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Line } from "vue-chartjs";

import type { MonthlyEmissionsResponse } from "../api/types.js";
import { formatMonthLabel, formatTonnes } from "../utils/format.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
);

const props = defineProps<{
  monthly: MonthlyEmissionsResponse | null;
  error?: string;
}>();

const chartData = computed(() => {
  if (!props.monthly) {
    return null;
  }
  const labels = props.monthly.months.map((m) => formatMonthLabel(m.month));
  const marchIndex = props.monthly.months.findIndex((m) => m.month === "2026-03");

  return {
    labels,
    datasets: [
      {
        label: "Scope 1 (t CO₂e)",
        data: props.monthly.months.map((m) => m.scope1TonnesCo2e),
        borderColor: "#0f766e",
        backgroundColor: "rgba(13, 148, 136, 0.12)",
        tension: 0.25,
        pointRadius: (ctx: { dataIndex: number }) =>
          ctx.dataIndex === marchIndex ? 6 : 3,
        pointBackgroundColor: (ctx: { dataIndex: number }) =>
          ctx.dataIndex === marchIndex ? "#d97706" : "#0f766e",
      },
      {
        label: "Scope 2 (t CO₂e)",
        data: props.monthly.months.map((m) => m.scope2TonnesCo2e),
        borderColor: "#1e40af",
        backgroundColor: "rgba(30, 64, 175, 0.08)",
        tension: 0.25,
        pointRadius: (ctx: { dataIndex: number }) =>
          ctx.dataIndex === marchIndex ? 6 : 3,
        pointBackgroundColor: (ctx: { dataIndex: number }) =>
          ctx.dataIndex === marchIndex ? "#d97706" : "#1e40af",
      },
    ],
  };
});

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: "index" as const, intersect: false },
  plugins: {
    legend: {
      position: "bottom" as const,
      labels: { boxWidth: 12, padding: 16 },
    },
    tooltip: {
      callbacks: {
        label: (ctx: { dataset: { label?: string }; parsed: { y: number | null } }) => {
          const value = ctx.parsed.y ?? 0;
          return `${ctx.dataset.label}: ${formatTonnes(value)} t CO₂e`;
        },
      },
    },
  },
  scales: {
    y: {
      beginAtZero: true,
      title: { display: true, text: "t CO₂e" },
    },
  },
};
</script>

<template>
  <section
    aria-labelledby="emissions-chart-heading"
    class="rounded-xl border border-border bg-card p-5 shadow-sm"
  >
    <div class="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 id="emissions-chart-heading" class="text-lg font-semibold text-navy-900">
          Monthly emissions
        </h2>
        <p class="text-sm text-muted">
          Deterministic Scope 1 and Scope 2 totals by reporting month.
        </p>
      </div>
      <p class="text-xs text-amber-500">
        Mar 2026 highlighted · Nov 2025 Scope 1 = 0 (fuel gap)
      </p>
    </div>

    <p v-if="error" class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {{ error }}
    </p>
    <div v-else-if="chartData" class="h-80">
      <Line :data="chartData" :options="chartOptions" />
    </div>
    <p v-else class="text-sm text-muted">No monthly emissions data available.</p>
  </section>
</template>
