/** Single source of truth for AI classification configuration. */

export const PROMPT_VERSION = "incident-classification-v3";

export const AI_CLASSIFY_CONCURRENCY = 3;
export const AI_CLASSIFY_MAX_RETRIES = 3;
export const AI_CLASSIFY_RETRY_BASE_MS = 1000;

export interface OpenAiRuntimeConfig {
  apiKey: string;
  model: string;
  promptVersion: string;
}

export function loadOpenAiConfig(): OpenAiRuntimeConfig {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = process.env.OPENAI_MODEL?.trim();

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }
  if (!model) {
    throw new Error("OPENAI_MODEL is not set");
  }

  return {
    apiKey,
    model,
    promptVersion: PROMPT_VERSION,
  };
}

export function hasOpenAiConfig(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim() && process.env.OPENAI_MODEL?.trim());
}
