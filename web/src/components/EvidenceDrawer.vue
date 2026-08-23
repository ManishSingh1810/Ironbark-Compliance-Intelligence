<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";

import { api } from "../api/client.js";
import type { EvidenceResponse, IncidentReviewItem, QualityIssueItem } from "../api/types.js";
import { formatConfidence, formatNullableText } from "../utils/format.js";
import { ANALYSIS_COMPLETE } from "../utils/aiDisplay.js";

const props = defineProps<{
  open: boolean;
  incident: IncidentReviewItem | null;
  issue: QualityIssueItem | null;
  returnFocusTo?: HTMLElement | null;
}>();

const emit = defineEmits<{
  close: [];
}>();

const loading = ref(false);
const error = ref<string | null>(null);
const evidence = ref<EvidenceResponse | null>(null);
const closeButton = ref<HTMLButtonElement | null>(null);

let abortController: AbortController | null = null;

function closeDrawer(): void {
  emit("close");
  requestAnimationFrame(() => {
    props.returnFocusTo?.focus();
  });
}

async function loadEvidence(): Promise<void> {
  abortController?.abort();
  abortController = new AbortController();

  if (props.incident) {
    loading.value = true;
    error.value = null;
    evidence.value = null;
    try {
      evidence.value = await api.evidence("incidents", props.incident.id, abortController.signal);
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Failed to load evidence.";
    } finally {
      loading.value = false;
    }
    return;
  }

  if (props.issue) {
    loading.value = true;
    error.value = null;
    evidence.value = null;

    if (!props.issue.entityId || !props.issue.entityTable) {
      error.value = null;
      loading.value = false;
      return;
    }

    try {
      evidence.value = await api.evidence(
        props.issue.entityTable,
        props.issue.entityId,
        abortController.signal,
      );
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Failed to load evidence.";
    } finally {
      loading.value = false;
    }
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape" && props.open) {
    event.preventDefault();
    closeDrawer();
  }
}

function isContextOnlyExcerpt(
  assessment: string | null,
  excerpt: string | null,
  description: string,
): boolean {
  if (!excerpt) {
    return false;
  }
  if (assessment === "no" || assessment === "consistent") {
    return excerpt.trim() === description.trim();
  }
  return false;
}

watch(
  () => [props.open, props.incident?.id, props.issue?.id] as const,
  ([isOpen]) => {
    if (isOpen) {
      void loadEvidence();
      requestAnimationFrame(() => closeButton.value?.focus());
    }
  },
);

onMounted(() => {
  document.addEventListener("keydown", onKeydown);
});

onUnmounted(() => {
  document.removeEventListener("keydown", onKeydown);
  abortController?.abort();
});

function recordValue(key: string): string {
  const value = evidence.value?.record[key];
  if (value === null || value === undefined) {
    return "Not provided";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex justify-end bg-navy-950/50"
      role="presentation"
      @click.self="closeDrawer"
    >
      <aside
        class="flex h-full w-full max-w-lg flex-col bg-card shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="evidence-drawer-title"
      >
        <header class="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 id="evidence-drawer-title" class="text-lg font-semibold text-navy-900">
            Source evidence
          </h2>
          <button
            ref="closeButton"
            type="button"
            class="rounded-md px-3 py-1.5 text-sm font-medium text-muted hover:bg-slate-100"
            @click="closeDrawer"
          >
            Close
          </button>
        </header>

        <div class="flex-1 overflow-y-auto px-5 py-4">
          <p v-if="loading" class="text-sm text-muted">Loading evidence…</p>

          <section v-if="issue" class="mb-6 space-y-2 text-sm">
            <p class="text-xs font-semibold tracking-wide text-muted uppercase">
              Data-quality issue
            </p>
            <p><span class="font-medium">{{ issue.issueCode }}</span> · {{ issue.action }}</p>
            <p class="text-muted">{{ issue.explanation }}</p>
            <p v-if="issue.sourceFilename">
              Source: {{ issue.sourceFilename }}
              <span v-if="issue.sourceRow !== null && issue.sourceRow !== undefined">
                · row {{ issue.sourceRow }}
              </span>
              <span v-else> · file/period-level (no source row)</span>
            </p>
            <p
              v-if="!issue.entityId"
              class="rounded-md bg-amber-100/60 px-3 py-2 text-xs text-amber-800"
            >
              No linked entity UUID — entity evidence cannot be loaded for this issue.
            </p>
            <p v-if="issue.originalValue !== null && issue.originalValue !== undefined">
              Original: {{ issue.originalValue }}
            </p>
            <p v-if="issue.cleanedValue !== null && issue.cleanedValue !== undefined">
              Cleaned: {{ issue.cleanedValue }}
            </p>
          </section>

          <p v-if="error" class="mb-4 text-sm text-red-700">{{ error }}</p>

          <template v-if="!loading && !error">
            <section v-if="incident" class="mb-6 space-y-3">
              <p class="text-xs font-semibold tracking-wide text-teal-700 uppercase">
                AI-assisted incident
              </p>
              <dl class="grid gap-2 text-sm">
                <div>
                  <dt class="text-muted">Source incident ID</dt>
                  <dd class="font-medium">{{ incident.sourceIncidentId }}</dd>
                </div>
                <div>
                  <dt class="text-muted">Internal UUID</dt>
                  <dd class="break-all font-mono text-xs">{{ incident.id }}</dd>
                </div>
                <div>
                  <dt class="text-muted">Source</dt>
                  <dd>{{ incident.sourceFilename }} · row {{ incident.sourceRow }}</dd>
                </div>
                <div>
                  <dt class="text-muted">Recorded</dt>
                  <dd>
                    {{ incident.typeCode }} ·
                    {{ incident.severityLabel ?? incident.severityRaw }}
                  </dd>
                </div>
                <div>
                  <dt class="text-muted">Analysis status</dt>
                  <dd>{{ incident.analysisStatus }}</dd>
                </div>
              </dl>

              <p class="rounded-md bg-slate-50 p-3 text-sm">{{ incident.description }}</p>

              <div
                v-if="incident.analysisStatus === ANALYSIS_COMPLETE"
                class="space-y-4 rounded-md border border-amber-500/30 bg-amber-100/30 p-3 text-sm"
              >
                <p class="text-xs font-semibold text-amber-600">
                  AI-assisted · Human review required
                </p>
                <p class="text-xs text-muted">
                  Model: {{ formatNullableText(incident.model) }} · Prompt:
                  {{ formatNullableText(incident.promptVersion) }}
                </p>

                <div class="space-y-2 border-t border-amber-500/20 pt-3">
                  <h3 class="font-medium text-navy-900">Safety category</h3>
                  <dl class="grid gap-1 text-xs">
                    <div>
                      <dt class="text-muted">Assessment</dt>
                      <dd>{{ formatNullableText(incident.safetyCategory) }}</dd>
                    </div>
                    <div>
                      <dt class="text-muted">Evidence excerpt</dt>
                      <dd class="rounded bg-white/70 p-2">
                        {{ formatNullableText(incident.evidence.safetyCategory) }}
                      </dd>
                    </div>
                    <div>
                      <dt class="text-muted">Explanation</dt>
                      <dd>{{ formatNullableText(incident.explanations.safetyCategory) }}</dd>
                    </div>
                    <div>
                      <dt class="text-muted">Confidence</dt>
                      <dd>{{ formatConfidence(incident.confidence.safetyCategory) }}</dd>
                    </div>
                  </dl>
                </div>

                <div class="space-y-2 border-t border-amber-500/20 pt-3">
                  <h3 class="font-medium text-navy-900">Psychosocial assessment</h3>
                  <dl class="grid gap-1 text-xs">
                    <div>
                      <dt class="text-muted">Assessment</dt>
                      <dd>{{ formatNullableText(incident.psychosocialAssessment) }}</dd>
                    </div>
                    <div>
                      <dt class="text-muted">Evidence excerpt</dt>
                      <dd class="rounded bg-white/70 p-2">
                        {{ formatNullableText(incident.evidence.psychosocial) }}
                      </dd>
                    </div>
                    <div>
                      <dt class="text-muted">Explanation</dt>
                      <dd>{{ formatNullableText(incident.explanations.psychosocial) }}</dd>
                    </div>
                    <div>
                      <dt class="text-muted">Confidence</dt>
                      <dd>{{ formatConfidence(incident.confidence.psychosocial) }}</dd>
                    </div>
                  </dl>
                  <p
                    v-if="
                      isContextOnlyExcerpt(
                        incident.psychosocialAssessment,
                        incident.evidence.psychosocial,
                        incident.description,
                      )
                    "
                    class="text-xs text-amber-800"
                  >
                    Stored excerpt is deterministic source context for a negative assessment —
                    not proof that no psychosocial hazard exists.
                  </p>
                </div>

                <div class="space-y-2 border-t border-amber-500/20 pt-3">
                  <h3 class="font-medium text-navy-900">Severity assessment</h3>
                  <dl class="grid gap-1 text-xs">
                    <div>
                      <dt class="text-muted">Assessment</dt>
                      <dd>{{ formatNullableText(incident.severityAssessment) }}</dd>
                    </div>
                    <div>
                      <dt class="text-muted">Evidence excerpt</dt>
                      <dd class="rounded bg-white/70 p-2">
                        {{ formatNullableText(incident.evidence.severity) }}
                      </dd>
                    </div>
                    <div>
                      <dt class="text-muted">Explanation</dt>
                      <dd>{{ formatNullableText(incident.explanations.severity) }}</dd>
                    </div>
                    <div>
                      <dt class="text-muted">Confidence</dt>
                      <dd>{{ formatConfidence(incident.confidence.severity) }}</dd>
                    </div>
                  </dl>
                  <p
                    v-if="
                      isContextOnlyExcerpt(
                        incident.severityAssessment,
                        incident.evidence.severity,
                        incident.description,
                      )
                    "
                    class="text-xs text-amber-800"
                  >
                    Stored excerpt is deterministic source context for a consistent assessment
                    — not proof that severity coding is correct.
                  </p>
                </div>
              </div>
            </section>

            <section v-if="evidence" class="space-y-3 text-sm">
              <h3 class="font-semibold">Stored record</h3>
              <dl class="grid gap-2">
                <div>
                  <dt class="text-muted">Entity</dt>
                  <dd>{{ evidence.entityTable }}</dd>
                </div>
                <div>
                  <dt class="text-muted">Source file / row</dt>
                  <dd>{{ evidence.sourceFilename }} · row {{ evidence.sourceRow }}</dd>
                </div>
                <div>
                  <dt class="text-muted">Description</dt>
                  <dd class="rounded bg-slate-50 p-2">{{ recordValue("description") }}</dd>
                </div>
                <div>
                  <dt class="text-muted">Source incident ID</dt>
                  <dd>{{ recordValue("source_incident_id") }}</dd>
                </div>
              </dl>

              <div v-if="evidence.qualityIssues.length">
                <h3 class="font-semibold">Related quality issues</h3>
                <ul class="space-y-2">
                  <li
                    v-for="qi in evidence.qualityIssues"
                    :key="qi.id"
                    class="rounded border border-border p-2 text-xs"
                  >
                    <span class="font-medium">{{ qi.issueCode }}</span> · {{ qi.action }}
                    <p class="text-muted">{{ qi.explanation }}</p>
                  </li>
                </ul>
              </div>
            </section>

            <p v-if="!incident && !issue && !evidence" class="text-sm text-muted">
              No evidence selected.
            </p>
          </template>
        </div>
      </aside>
    </div>
  </Teleport>
</template>
