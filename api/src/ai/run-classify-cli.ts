import { AI_CLASSIFY_CONCURRENCY, PROMPT_VERSION, loadOpenAiConfig } from "./config.js";
import { classifyAndStoreIncident, mapWithConcurrency } from "./classify-incident.js";
import { closePool } from "../db/client.js";
import { findLatestCompletedRunId } from "../repositories/ingestion-run-repository.js";
import {
  hasCompleteAnalysis,
  listIncidentsForClassification,
} from "../repositories/ai-incident-repository.js";

export interface ClassificationRunStats {
  ingestionRunId: string;
  model: string;
  promptVersion: string;
  attempted: number;
  completed: number;
  skipped: number;
  failed: number;
  failures: Array<{ sourceIncidentId: string; reason: string }>;
}

export async function runIncidentClassification(): Promise<ClassificationRunStats> {
  const config = loadOpenAiConfig();
  const ingestionRunId = await findLatestCompletedRunId();
  const incidents = await listIncidentsForClassification(ingestionRunId);

  const stats: ClassificationRunStats = {
    ingestionRunId,
    model: config.model,
    promptVersion: config.promptVersion,
    attempted: 0,
    completed: 0,
    skipped: 0,
    failed: 0,
    failures: [],
  };

  const pending: typeof incidents = [];
  for (const incident of incidents) {
    const complete = await hasCompleteAnalysis(
      incident.id,
      config.model,
      config.promptVersion,
    );
    if (complete) {
      stats.skipped += 1;
      continue;
    }
    pending.push(incident);
  }

  if (pending.length === 0) {
    return stats;
  }

  await mapWithConcurrency(pending, AI_CLASSIFY_CONCURRENCY, async (incident) => {
    stats.attempted += 1;
    process.stdout.write(
      `Classifying ${incident.source_incident_id} (${stats.attempted}/${pending.length})...\n`,
    );

    try {
      await classifyAndStoreIncident(incident, config);
      stats.completed += 1;
    } catch (error) {
      stats.failed += 1;
      stats.failures.push({
        sourceIncidentId: incident.source_incident_id,
        reason: error instanceof Error ? error.message : "Unknown classification error",
      });
      process.stderr.write(
        `Failed ${incident.source_incident_id}: ${stats.failures.at(-1)?.reason}\n`,
      );
    }
  });

  return stats;
}

export async function runIncidentClassificationCli(): Promise<void> {
  const stats = await runIncidentClassification();

  console.log("");
  console.log("AI incident classification complete");
  console.log(`  ingestion run: ${stats.ingestionRunId}`);
  console.log(`  model: ${stats.model}`);
  console.log(`  prompt: ${stats.promptVersion ?? PROMPT_VERSION}`);
  console.log(`  attempted: ${stats.attempted}`);
  console.log(`  completed: ${stats.completed}`);
  console.log(`  skipped: ${stats.skipped}`);
  console.log(`  failed: ${stats.failed}`);

  if (stats.failures.length > 0) {
    console.log("  failures:");
    for (const failure of stats.failures) {
      console.log(`    - ${failure.sourceIncidentId}: ${failure.reason}`);
    }
  }

  await closePool();

  if (stats.failed > 0) {
    process.exitCode = 1;
  }
}
