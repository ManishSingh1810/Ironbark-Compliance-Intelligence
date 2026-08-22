export function normaliseVolumeUnit(rawUnit: string): "litres" {
  const unit = rawUnit.trim().toLowerCase();
  if (unit === "l" || unit === "litres") {
    return "litres";
  }
  if (unit === "kl") {
    return "litres";
  }
  throw new Error(`Unsupported volume unit: ${rawUnit}`);
}

export function quantityToLitres(quantityRaw: string, unitRaw: string): number {
  const quantity = Number.parseFloat(quantityRaw.trim());
  if (Number.isNaN(quantity)) {
    throw new Error(`Unparseable quantity: ${quantityRaw}`);
  }

  const unit = unitRaw.trim().toLowerCase();
  if (unit === "l" || unit === "litres") {
    return quantity;
  }
  if (unit === "kl") {
    return quantity * 1000;
  }
  throw new Error(`Unsupported volume unit: ${unitRaw}`);
}

export function parseConsumptionKwh(raw: string): number {
  const value = Number.parseFloat(raw.trim());
  if (Number.isNaN(value)) {
    throw new Error(`Unparseable kWh value: ${raw}`);
  }
  return value;
}
