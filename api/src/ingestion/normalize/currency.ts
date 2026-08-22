export function parseCurrency(raw: string): number {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Empty currency value");
  }

  const negative = trimmed.includes("-") || trimmed.startsWith("($");
  const digits = trimmed.replace(/[^0-9.]/g, "");
  if (!digits) {
    throw new Error(`Unparseable currency value: ${raw}`);
  }

  const value = Number.parseFloat(digits);
  if (Number.isNaN(value)) {
    throw new Error(`Unparseable currency value: ${raw}`);
  }

  return negative ? -value : value;
}
