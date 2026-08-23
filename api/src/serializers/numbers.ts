/** Round only at API serialisation boundaries — keep internal math precise. */

export function roundTo(value: number, decimals: number): number {
  if (!Number.isFinite(value)) {
    throw new Error("Cannot round a non-finite numeric value");
  }
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function roundActivity(value: number): number {
  return roundTo(value, 3);
}

export function roundKgCo2e(value: number): number {
  return roundTo(value, 3);
}

export function roundTonnesCo2e(value: number): number {
  return roundTo(value, 3);
}

export function kgToTonnes(kg: number): number {
  return kg / 1000;
}

/**
 * Strict numeric parse for compliance totals.
 * Genuine zeros are valid; null/empty/NaN/Infinity throw.
 */
export function parseRequiredNumeric(value: string | number | null | undefined): number {
  if (value === null || value === undefined) {
    throw new Error("Required numeric value is null or undefined");
  }
  if (typeof value === "string" && value.trim() === "") {
    throw new Error("Required numeric value is empty");
  }
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error("Required numeric value is not a finite number");
  }
  return parsed;
}

export function formatMonthKey(date: Date | string): string {
  if (typeof date === "string") {
    return date.slice(0, 7);
  }
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}
