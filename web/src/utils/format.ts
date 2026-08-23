/** Display formatting helpers — display only, never used to alter backend calculations. */

export function formatTonnes(value: number, fractionDigits = 1): string {
  return value.toLocaleString("en-AU", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

export function formatCount(value: number): string {
  return value.toLocaleString("en-AU");
}

export function formatPercentChange(from: number, to: number): string {
  if (from === 0) {
    return to === 0 ? "0.0%" : "N/A (from zero)";
  }
  const change = ((to - from) / from) * 100;
  const sign = change > 0 ? "+" : "";
  return `${sign}${change.toFixed(1)}%`;
}

export function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("en-AU", { month: "short", year: "numeric" });
}

export function formatCategoryLabel(value: string): string {
  return value.replaceAll("_", " ");
}

export function formatConfidence(value: number | null): string {
  if (value === null) {
    return "Not provided";
  }
  return `${Math.round(value * 100)}%`;
}

export function formatNullableText(value: string | null | undefined): string {
  if (value === null || value === undefined || value.trim() === "") {
    return "Not provided";
  }
  return value;
}

export function kgToTonnes(kg: number): number {
  return kg / 1000;
}
