<script setup lang="ts">
import type { IncidentReviewItem } from "../api/types.js";
import {
  ANALYSIS_COMPLETE,
  PSYCHOSOCIAL_YES,
  SEVERITY_POSSIBLY_INCONSISTENT,
} from "../utils/aiDisplay.js";
import { formatConfidence } from "../utils/format.js";

defineProps<{
  incident: IncidentReviewItem;
}>();

const emit = defineEmits<{
  open: [];
}>();

function statusLabel(status: string): string {
  if (status === ANALYSIS_COMPLETE) {
    return "Complete";
  }
  if (status === "partial") {
    return "Partial";
  }
  return "Pending";
}

function statusClass(status: string): string {
  if (status === "complete") {
    return "bg-teal-600/10 text-teal-700";
  }
  if (status === "partial") {
    return "bg-amber-100 text-amber-500";
  }
  return "bg-slate-100 text-muted";
}
</script>

<template>
  <article class="rounded-lg border border-border bg-card p-4">
    <div class="flex flex-wrap items-center gap-2">
      <button
        type="button"
        class="font-semibold text-navy-900 underline-offset-2 hover:underline"
        @click="emit('open')"
      >
        {{ incident.sourceIncidentId }}
      </button>
      <span
        class="rounded px-2 py-0.5 text-xs font-medium"
        :class="statusClass(incident.analysisStatus)"
      >
        {{ statusLabel(incident.analysisStatus) }}
      </span>
      <span class="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-500">
        AI-assisted
      </span>
      <span class="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-500">
        Human review required
      </span>
    </div>
    <p class="mt-2 text-sm text-muted">
      {{ incident.typeCode }} · {{ incident.severityLabel ?? incident.severityRaw }}
    </p>
    <p class="mt-2 text-sm">{{ incident.description }}</p>
    <dl class="mt-3 grid gap-2 text-xs text-muted">
      <div v-if="incident.psychosocialAssessment === PSYCHOSOCIAL_YES">
        <dt class="font-medium text-navy-900">Psychosocial</dt>
        <dd>
          {{ incident.evidence.psychosocial }} ·
          {{ formatConfidence(incident.confidence.psychosocial) }}
        </dd>
        <dd class="mt-1">{{ incident.explanations.psychosocial }}</dd>
      </div>
      <div v-if="incident.severityAssessment === SEVERITY_POSSIBLY_INCONSISTENT">
        <dt class="font-medium text-navy-900">Severity review</dt>
        <dd>
          {{ incident.evidence.severity }} ·
          {{ formatConfidence(incident.confidence.severity) }}
        </dd>
        <dd class="mt-1">{{ incident.explanations.severity }}</dd>
      </div>
    </dl>
  </article>
</template>
