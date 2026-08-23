<script setup lang="ts">
import { computed } from "vue";

import type { IncidentReviewItem, MonthlyEmissionsResponse } from "../api/types.js";
import { computeMarchActivityShift } from "../utils/marchInsight.js";
import { formatTonnes } from "../utils/format.js";

const props = defineProps<{
  monthly: MonthlyEmissionsResponse | null;
  incidents: IncidentReviewItem[];
}>();

const emit = defineEmits<{
  openEvidence: [incident: IncidentReviewItem];
}>();

const shift = computed(() =>
  props.monthly ? computeMarchActivityShift(props.monthly) : null,
);

const incident131 = computed(() =>
  props.incidents.find((i) => i.sourceIncidentId === "INC-2026-131"),
);
const incident134 = computed(() =>
  props.incidents.find((i) => i.sourceIncidentId === "INC-2026-134"),
);
</script>

<template>
  <section
    aria-labelledby="march-insight-heading"
    class="rounded-xl border-2 border-teal-600/30 bg-gradient-to-br from-white to-teal-600/5 p-6 shadow-sm"
  >
    <div class="mb-4">
      <p class="text-xs font-semibold tracking-wide text-teal-700 uppercase">
        Standout insight
      </p>
      <h2 id="march-insight-heading" class="mt-1 text-xl font-semibold text-navy-900">
        March 2026 activity shift
      </h2>
      <p class="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
        The aligned timing suggests backup-generator operation may explain the activity
        shift, but the data does not prove causation.
      </p>
    </div>

    <div v-if="shift" class="grid gap-4 lg:grid-cols-2">
      <div class="rounded-lg border border-border bg-card p-4">
        <h3 class="text-sm font-semibold text-navy-900">Scope 2 emissions (grid proxy)</h3>
        <p class="mt-2 text-2xl font-semibold text-navy-900">
          {{ shift.scope2ChangeLabel }}
        </p>
        <p class="mt-1 text-xs text-muted">
          {{ formatTonnes(shift.scope2FromTonnes) }} → {{ formatTonnes(shift.scope2ToTonnes) }}
          t CO₂e
        </p>
      </div>
      <div class="rounded-lg border border-border bg-card p-4">
        <h3 class="text-sm font-semibold text-navy-900">Scope 1 emissions (diesel proxy)</h3>
        <p class="mt-2 text-2xl font-semibold text-navy-900">
          {{ shift.scope1ChangeLabel }}
        </p>
        <p class="mt-1 text-xs text-muted">
          {{ formatTonnes(shift.scope1FromTonnes) }} → {{ formatTonnes(shift.scope1ToTonnes) }}
          t CO₂e
        </p>
      </div>
    </div>
    <p v-else class="text-sm text-muted">
      Monthly emissions data for Feb/Mar 2026 is unavailable.
    </p>

    <p v-if="shift" class="mt-3 text-xs text-muted">{{ shift.derivedFrom }}</p>

    <ul class="mt-5 space-y-3">
      <li v-if="incident131">
        <button
          type="button"
          class="w-full rounded-lg border border-border bg-card px-4 py-3 text-left transition hover:border-teal-600 focus-visible:ring-2 focus-visible:ring-teal-600"
          @click="emit('openEvidence', incident131)"
        >
          <span class="font-medium text-navy-900">{{ incident131.sourceIncidentId }}</span>
          <span class="ml-2 text-xs text-amber-500">View evidence</span>
          <p class="mt-1 text-sm text-muted">{{ incident131.description }}</p>
        </button>
      </li>
      <li v-if="incident134">
        <button
          type="button"
          class="w-full rounded-lg border border-border bg-card px-4 py-3 text-left transition hover:border-teal-600 focus-visible:ring-2 focus-visible:ring-teal-600"
          @click="emit('openEvidence', incident134)"
        >
          <span class="font-medium text-navy-900">{{ incident134.sourceIncidentId }}</span>
          <span class="ml-2 text-xs text-amber-500">View evidence</span>
          <p class="mt-1 text-sm text-muted">{{ incident134.description }}</p>
        </button>
      </li>
    </ul>
  </section>
</template>
