import { SEVERITY_NORMALISATION } from "../../domain/constants.js";

export interface NormalisedSeverity {
  severityNormalised: number;
  severityLabel: string;
}

export function normaliseSeverity(raw: string): NormalisedSeverity {
  const key = raw.trim();
  const mapped = SEVERITY_NORMALISATION[key];
  if (!mapped) {
    throw new Error(`Unsupported severity value: ${raw}`);
  }
  return {
    severityNormalised: mapped.rank,
    severityLabel: mapped.label,
  };
}
