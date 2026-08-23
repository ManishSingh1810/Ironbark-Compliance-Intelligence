<script setup lang="ts">
defineProps<{
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  variant?: "default" | "review" | "deterministic";
}>();
</script>

<template>
  <article
    class="rounded-xl border border-border bg-card p-5 shadow-sm"
    :class="{
      'border-l-4 border-l-teal-600': variant === 'deterministic',
      'border-l-4 border-l-amber-500': variant === 'review',
    }"
  >
    <h3 class="text-sm font-medium text-muted">{{ label }}</h3>
    <p class="mt-2 text-2xl font-semibold tracking-tight text-navy-900">
      {{ value }}
      <span v-if="unit" class="text-base font-normal text-muted">{{ unit }}</span>
    </p>
    <p v-if="hint" class="mt-2 text-xs leading-relaxed text-muted">{{ hint }}</p>
  </article>
</template>
