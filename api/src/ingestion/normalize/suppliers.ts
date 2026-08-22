export function normaliseAbnDigits(raw: string | undefined | null): string {
  return (raw ?? "").replace(/\D/g, "");
}

export function isValidAbnLength(digits: string): boolean {
  return digits.length === 11;
}

export function normaliseSupplierName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}
