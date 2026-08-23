<script setup lang="ts">
import { computed, ref, watch } from "vue";

import type {
  DataQualityIssuesResponse,
  DataQualitySummaryResponse,
  EmissionsSummaryResponse,
  QualityIssueItem,
} from "../api/types.js";

const INITIAL_VISIBLE = 8;

const props = defineProps<{
  summary: DataQualitySummaryResponse | null;
  issues: DataQualityIssuesResponse | null;
  emissionsCaveats: EmissionsSummaryResponse["dataQualityCaveats"] | null;
  error?: string;
}>();

const emit = defineEmits<{
  openIssue: [issue: QualityIssueItem];
}>();

const actionFilter = ref<"all" | "fixed" | "flagged" | "rejected">("all");
const codeFilter = ref("");
const expanded = ref(false);

const topIssueCodes = computed(() => {
  if (!props.summary) {
    return [];
  }
  return [...props.summary.byIssueCode]
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
});

const actionTotals = computed(() => {
  const map = new Map<string, number>();
  for (const row of props.summary?.byAction ?? []) {
    map.set(row.action, row.count);
  }
  return {
    fixed: map.get("fixed") ?? 0,
    flagged: map.get("flagged") ?? 0,
    rejected: map.get("rejected") ?? 0,
  };
});

const filteredIssues = computed(() => {
  const rows = props.issues?.issues ?? [];
  return rows.filter((issue) => {
    if (actionFilter.value !== "all" && issue.action !== actionFilter.value) {
      return false;
    }
    if (codeFilter.value && issue.issueCode !== codeFilter.value) {
      return false;
    }
    return true;
  });
});

const visibleIssues = computed(() => {
  if (expanded.value) {
    return filteredIssues.value;
  }
  return filteredIssues.value.slice(0, INITIAL_VISIBLE);
});

const hiddenCount = computed(() =>
  Math.max(0, filteredIssues.value.length - INITIAL_VISIBLE),
);

watch([actionFilter, codeFilter], () => {
  expanded.value = false;
});

function issueTraceLabel(issue: QualityIssueItem): string {
  const parts: string[] = [];
  if (issue.sourceFilename) {
    parts.push(issue.sourceFilename);
  }
  if (issue.sourceRow !== null && issue.sourceRow !== undefined) {
    parts.push(`row ${issue.sourceRow}`);
  } else {
    parts.push("file/period-level");
  }
  if (!issue.entityId) {
    parts.push("no entity id");
  }
  return parts.join(" · ");
}
</script>

<template>
  <section aria-labelledby="dq-heading" class="space-y-6">
    <div>
      <h2 id="dq-heading" class="text-lg font-semibold text-navy-900">Data quality</h2>
      <p class="text-sm text-muted">
        Ingestion caveats affecting how totals should be interpreted.
      </p>
    </div>

    <p
      v-if="error"
      class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
    >
      {{ error }}
    </p>

    <div v-else class="grid gap-4 sm:grid-cols-3">
      <article class="rounded-xl border border-border bg-card p-4">
        <h3 class="text-sm font-medium text-muted">Fixed</h3>
        <p class="mt-1 text-2xl font-semibold">{{ actionTotals.fixed }}</p>
      </article>
      <article class="rounded-xl border border-l-4 border-border border-l-amber-500 bg-card p-4">
        <h3 class="text-sm font-medium text-muted">Flagged</h3>
        <p class="mt-1 text-2xl font-semibold">{{ actionTotals.flagged }}</p>
      </article>
      <article class="rounded-xl border border-l-4 border-border border-l-red-600 bg-card p-4">
        <h3 class="text-sm font-medium text-muted">Rejected</h3>
        <p class="mt-1 text-2xl font-semibold">{{ actionTotals.rejected }}</p>
      </article>
    </div>

    <div v-if="topIssueCodes.length" class="rounded-xl border border-border bg-card p-4">
      <h3 class="mb-3 text-sm font-semibold">Top issue codes</h3>
      <ul class="space-y-2">
        <li
          v-for="item in topIssueCodes"
          :key="item.issueCode"
          class="flex items-center justify-between text-sm"
        >
          <span class="font-medium">{{ item.issueCode }}</span>
          <span class="text-muted">{{ item.count }}</span>
        </li>
      </ul>
    </div>

    <div
      v-if="emissionsCaveats?.length"
      class="rounded-xl border border-amber-500/30 bg-amber-100/40 p-4"
    >
      <h3 class="text-sm font-semibold text-navy-900">Emissions caveats</h3>
      <ul class="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
        <li v-for="caveat in emissionsCaveats" :key="caveat">{{ caveat }}</li>
      </ul>
    </div>

    <div>
      <div class="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <h3 class="text-sm font-semibold">Inspect issue details</h3>
        <div class="flex flex-wrap gap-2">
          <label class="text-xs text-muted">
            Action
            <select
              v-model="actionFilter"
              class="ml-1 rounded border border-border bg-card px-2 py-1 text-sm text-navy-900"
            >
              <option value="all">All</option>
              <option value="fixed">Fixed</option>
              <option value="flagged">Flagged</option>
              <option value="rejected">Rejected</option>
            </select>
          </label>
          <label class="text-xs text-muted">
            Code
            <select
              v-model="codeFilter"
              class="ml-1 rounded border border-border bg-card px-2 py-1 text-sm text-navy-900"
            >
              <option value="">All codes</option>
              <option
                v-for="item in topIssueCodes"
                :key="item.issueCode"
                :value="item.issueCode"
              >
                {{ item.issueCode }}
              </option>
            </select>
          </label>
        </div>
      </div>

      <p class="mb-2 text-xs text-muted">
        Showing {{ visibleIssues.length }} of {{ filteredIssues.length }} matching issues
        <span v-if="issues">({{ issues.count }} total loaded)</span>
      </p>

      <ul v-if="visibleIssues.length" class="space-y-2">
        <li v-for="issue in visibleIssues" :key="issue.id">
          <button
            type="button"
            class="w-full rounded-lg border border-border bg-card px-4 py-3 text-left text-sm hover:border-teal-600"
            @click="emit('openIssue', issue)"
          >
            <span class="font-medium">{{ issue.issueCode }}</span>
            <span class="ml-2 text-xs text-muted">{{ issue.action }}</span>
            <p class="mt-1 text-muted">{{ issue.explanation }}</p>
            <p class="mt-1 text-xs text-muted">{{ issueTraceLabel(issue) }}</p>
          </button>
        </li>
      </ul>
      <p v-else class="text-sm text-muted">No issues match the current filters.</p>

      <button
        v-if="!expanded && hiddenCount > 0"
        type="button"
        class="mt-3 rounded-md border border-border px-3 py-2 text-sm font-medium text-navy-900 hover:border-teal-600"
        @click="expanded = true"
      >
        Show more ({{ hiddenCount }} remaining)
      </button>
      <button
        v-else-if="expanded && filteredIssues.length > INITIAL_VISIBLE"
        type="button"
        class="mt-3 rounded-md border border-border px-3 py-2 text-sm font-medium text-navy-900 hover:border-teal-600"
        @click="expanded = false"
      >
        Show fewer
      </button>
    </div>
  </section>
</template>
