import {
  AI_CLASSIFY_MAX_RETRIES,
  AI_CLASSIFY_RETRY_BASE_MS,
  type OpenAiRuntimeConfig,
} from "./config.js";
import { GroundingValidationError, validateAndGroundClassification } from "./grounding.js";
import {
  OpenAiClassificationError,
  createOpenAiClient,
  requestIncidentClassification,
  sleep,
} from "./openai-client.js";
import {
  mapPsychosocialToBoolean,
  mapSeverityToInconsistent,
} from "./schemas/incident-classification.js";
import type { AiFindingInsert, IncidentForClassification } from "../repositories/ai-incident-repository.js";
import { withTransaction } from "../db/client.js";
import { insertFindings } from "../repositories/ai-incident-repository.js";

export interface ClassificationDependencies {
  requestClassification: typeof requestIncidentClassification;
}

export const defaultClassificationDependencies: ClassificationDependencies = {
  requestClassification: requestIncidentClassification,
};

export function buildFindingsFromClassification(
  incidentId: string,
  config: OpenAiRuntimeConfig,
  grounded: ReturnType<typeof validateAndGroundClassification>,
): AiFindingInsert[] {
  const { output, groundedExcerpts } = grounded;

  return [
    {
      incidentId,
      findingType: "safety_category",
      safetyCategory: output.safetyCategory,
      isPsychosocialHazard: null,
      severityInconsistent: null,
      evidenceExcerpt: groundedExcerpts.category,
      explanation: output.categoryExplanation,
      confidence: output.categoryConfidence,
      model: config.model,
      promptVersion: config.promptVersion,
    },
    {
      incidentId,
      findingType: "psychosocial_hazard",
      safetyCategory: null,
      isPsychosocialHazard: mapPsychosocialToBoolean(output.psychosocialAssessment),
      severityInconsistent: null,
      evidenceExcerpt: groundedExcerpts.psychosocial,
      explanation: output.psychosocialExplanation,
      confidence: output.psychosocialConfidence,
      model: config.model,
      promptVersion: config.promptVersion,
    },
    {
      incidentId,
      findingType: "severity_inconsistency",
      safetyCategory: null,
      isPsychosocialHazard: null,
      severityInconsistent: mapSeverityToInconsistent(output.severityAssessment),
      evidenceExcerpt: groundedExcerpts.severity,
      explanation: output.severityExplanation,
      confidence: output.severityConfidence,
      model: config.model,
      promptVersion: config.promptVersion,
    },
  ];
}

export async function classifyAndStoreIncident(
  incident: IncidentForClassification,
  config: OpenAiRuntimeConfig,
  deps: ClassificationDependencies = defaultClassificationDependencies,
): Promise<void> {
  const client = createOpenAiClient(config.apiKey);
  let lastError: unknown;

  for (let attempt = 0; attempt <= AI_CLASSIFY_MAX_RETRIES; attempt += 1) {
    try {
      const output = await deps.requestClassification(client, config.model, {
        sourceIncidentId: incident.source_incident_id,
        severityRaw: incident.severity_raw,
        severityLabel: incident.severity_label,
        severityNormalised: incident.severity_normalised,
        typeCode: incident.type_code,
        description: incident.description,
      });

      const grounded = validateAndGroundClassification(incident.description, output);
      const findings = buildFindingsFromClassification(incident.id, config, grounded);

      await withTransaction(async (tx) => {
        await insertFindings(tx, findings);
      });
      return;
    } catch (error) {
      if (error instanceof GroundingValidationError) {
        throw error;
      }
      if (error instanceof OpenAiClassificationError) {
        if (!error.retryable) {
          throw error;
        }
        lastError = error;
        if (attempt < AI_CLASSIFY_MAX_RETRIES) {
          await sleep(AI_CLASSIFY_RETRY_BASE_MS * 2 ** attempt);
        }
        continue;
      }

      throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Classification failed after retries.");
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      results[current] = await fn(items[current]!, current);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}
