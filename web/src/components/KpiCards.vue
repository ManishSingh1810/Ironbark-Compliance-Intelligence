<script setup lang="ts">
import KpiCard from "./KpiCard.vue";

defineProps<{
  scope1Tonnes: number | null;
  scope2Tonnes: number | null;
  combinedTonnes: number | null;
  totalIncidents: number | null;
  dataQualityIssues: number | null;
  aiReviewCount: number | null;
  aiReviewDisplay: string;
}>();
</script>

<template>
  <section aria-labelledby="kpi-heading">
    <h2 id="kpi-heading" class="sr-only">Key performance indicators</h2>
    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <KpiCard
        label="Scope 1 emissions"
        :value="scope1Tonnes !== null ? scope1Tonnes.toLocaleString('en-AU', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '—'"
        unit="t CO₂e"
        hint="Deterministic calculation from included fuel deliveries."
        variant="deterministic"
      />
      <KpiCard
        label="Scope 2 emissions"
        :value="scope2Tonnes !== null ? scope2Tonnes.toLocaleString('en-AU', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '—'"
        unit="t CO₂e"
        hint="Deterministic calculation from included grid electricity."
        variant="deterministic"
      />
      <KpiCard
        label="Combined emissions"
        :value="combinedTonnes !== null ? combinedTonnes.toLocaleString('en-AU', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '—'"
        unit="t CO₂e"
        hint="Scope 1 + Scope 2. Scope 3 not calculated."
        variant="deterministic"
      />
      <KpiCard
        label="Total incidents"
        :value="totalIncidents !== null ? totalIncidents.toLocaleString('en-AU') : '—'"
        hint="All incidents in the latest completed ingestion run."
      />
      <KpiCard
        label="Data-quality issues"
        :value="dataQualityIssues !== null ? dataQualityIssues.toLocaleString('en-AU') : '—'"
        hint="Fixed, flagged, and rejected ingestion issues."
      />
      <KpiCard
        label="AI review queue"
        :value="aiReviewDisplay"
        :hint="
          aiReviewCount === null
            ? 'Unavailable until AI review data loads successfully.'
            : 'Unique incidents flagged for psychosocial hazard or possible severity inconsistency.'
        "
        variant="review"
      />
    </div>
  </section>
</template>
