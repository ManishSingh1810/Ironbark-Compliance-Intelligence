<script setup lang="ts">
defineProps<{
  apiConnected: boolean;
  analysedCount: number | null;
  totalIncidents: number | null;
  model: string | null;
  promptVersion: string | null;
  aiStatusNote?: string | null;
}>();
</script>

<template>
  <header class="border-b border-border bg-navy-950 text-white">
    <div class="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p class="text-sm font-medium tracking-wide text-teal-600 uppercase">
            Ironbark Ridge
          </p>
          <h1 class="text-2xl font-semibold tracking-tight sm:text-3xl">
            Compliance Intelligence
          </h1>
          <p class="mt-1 text-sm text-slate-300">Reporting period: Jan 2025 – Jun 2026</p>
        </div>
        <div class="w-full min-w-0 max-w-md rounded-lg border border-slate-700 bg-navy-900 px-4 py-3 text-sm">
          <p class="font-medium text-slate-200">Latest data status</p>
          <p class="mt-1 text-slate-400">
            API:
            <span :class="apiConnected ? 'text-teal-600' : 'text-red-400'">
              {{ apiConnected ? "Connected" : "Unavailable" }}
            </span>
          </p>
          <p class="mt-1 break-all text-slate-400">
            AI:
            <template v-if="analysedCount !== null && totalIncidents !== null">
              {{ analysedCount }}/{{ totalIncidents }} analysed
            </template>
            <template v-else>status unavailable</template>
            <template v-if="model"> · {{ model }}</template>
            <template v-if="promptVersion"> · {{ promptVersion }}</template>
          </p>
          <p v-if="aiStatusNote" class="mt-2 text-xs text-amber-400">{{ aiStatusNote }}</p>
        </div>
      </div>
      <p
        class="inline-flex w-fit items-center rounded-md border border-amber-500/40 bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-500"
        role="note"
      >
        AI-assisted findings require human review
      </p>
    </div>
  </header>
</template>
