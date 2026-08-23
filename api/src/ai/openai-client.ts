import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";

import {
  INCIDENT_CLASSIFICATION_SYSTEM_PROMPT,
  buildIncidentUserMessage,
} from "./prompts/incident-classification-v3.js";
import {
  incidentClassificationSchema,
  type IncidentClassificationOutput,
} from "./schemas/incident-classification.js";

export interface ClassifyIncidentInput {
  sourceIncidentId: string;
  severityRaw: string;
  severityLabel: string | null;
  severityNormalised: number | null;
  typeCode: string;
  description: string;
}

export function createOpenAiClient(apiKey: string): OpenAI {
  return new OpenAI({ apiKey });
}

export class OpenAiClassificationError extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = "OpenAiClassificationError";
    this.retryable = retryable;
  }
}

function isRetryableStatus(status: number | undefined): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

export async function requestIncidentClassification(
  client: OpenAI,
  model: string,
  input: ClassifyIncidentInput,
): Promise<IncidentClassificationOutput> {
  try {
    const completion = await client.beta.chat.completions.parse({
      model,
      temperature: 0.2,
      messages: [
        { role: "system", content: INCIDENT_CLASSIFICATION_SYSTEM_PROMPT },
        {
          role: "user",
          content: buildIncidentUserMessage(input),
        },
      ],
      response_format: zodResponseFormat(
        // zod3 schema for OpenAI structured outputs (project uses zod v4 elsewhere)
        incidentClassificationSchema as never,
        "incident_classification",
      ),
    });

    const message = completion.choices[0]?.message;
    if (message?.refusal) {
      throw new OpenAiClassificationError(
        "The model refused to classify this incident.",
        false,
      );
    }

    const parsed = message?.parsed;
    if (!parsed) {
      throw new OpenAiClassificationError(
        "The model returned no structured classification output.",
        false,
      );
    }

    return incidentClassificationSchema.parse(parsed);
  } catch (error) {
    if (error instanceof OpenAiClassificationError) {
      throw error;
    }

    const status =
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      typeof (error as { status?: unknown }).status === "number"
        ? (error as { status: number }).status
        : undefined;

    const errorCode =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof (error as { code?: unknown }).code === "string"
        ? (error as { code: string }).code
        : undefined;

    if (errorCode === "insufficient_quota") {
      throw new OpenAiClassificationError(
        "OpenAI API quota exceeded. Check billing/plan before rerunning classification.",
        false,
      );
    }

    if (isRetryableStatus(status)) {
      throw new OpenAiClassificationError(
        "Transient OpenAI API error while classifying incident.",
        true,
      );
    }

    throw new OpenAiClassificationError(
      error instanceof Error ? error.message : "OpenAI classification failed.",
      false,
    );
  }
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
