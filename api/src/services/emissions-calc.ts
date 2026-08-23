import { AppError } from "../errors.js";
import {
  FUEL_TYPE_TO_FACTOR_ACTIVITY,
  GRID_ELECTRICITY_FACTOR_ACTIVITY,
  factorActivityForFuelType,
} from "../domain/factor-mapping.js";
import {
  formatMonthKey,
  kgToTonnes,
  parseRequiredNumeric,
  roundActivity,
  roundKgCo2e,
  roundTonnesCo2e,
} from "../serializers/numbers.js";

export interface FactorInput {
  activity: string;
  scope: number;
  unit: string;
  kgCo2ePerUnit: number;
  factorSource: string;
  sourceFilename: string;
  sourceRow: number;
}

export interface FuelActivityInput {
  fuelType: string;
  quantityLitres: number;
}

export interface ElectricityActivityInput {
  consumptionKwh: number;
}

export interface MonthlyFuelInput {
  month: string;
  fuelType: string;
  quantityLitres: number;
}

export interface MonthlyElectricityInput {
  month: string;
  consumptionKwh: number;
}

export const EMISSIONS_MONTH_START = "2025-01";
export const EMISSIONS_MONTH_END = "2026-06";

export function buildMonthRange(
  start = EMISSIONS_MONTH_START,
  end = EMISSIONS_MONTH_END,
): string[] {
  const months: string[] = [];
  const [startYear, startMonth] = start.split("-").map(Number) as [number, number];
  const [endYear, endMonth] = end.split("-").map(Number) as [number, number];
  let year = startYear;
  let month = startMonth;
  while (year < endYear || (year === endYear && month <= endMonth)) {
    months.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

export function resolveActivityMonth(
  reportingMonth: Date | string | null,
  deliveryDate: Date | string | null,
): string | null {
  if (reportingMonth) {
    return formatMonthKey(reportingMonth);
  }
  if (deliveryDate) {
    return formatMonthKey(deliveryDate);
  }
  return null;
}

function indexFactorsByActivity(factors: FactorInput[]): Map<string, FactorInput> {
  return new Map(factors.map((factor) => [factor.activity, factor]));
}

/**
 * Fail closed before any Scope 1/2 totals are returned.
 * Never silently omit activity with missing mappings or factors.
 */
export function assertEmissionsConfiguration(
  fuelTypes: Iterable<string>,
  factors: FactorInput[],
): void {
  const byActivity = indexFactorsByActivity(factors);
  const distinctFuelTypes = [...new Set(fuelTypes)];

  for (const fuelType of distinctFuelTypes) {
    const activity = factorActivityForFuelType(fuelType);
    if (!activity) {
      throw new AppError(
        500,
        "EMISSIONS_DATA_INTEGRITY_ERROR",
        `No emission-factor mapping configured for fuel type "${fuelType}".`,
      );
    }
  }

  for (const [fuelType, activity] of Object.entries(FUEL_TYPE_TO_FACTOR_ACTIVITY)) {
    const factor = byActivity.get(activity);
    if (!factor) {
      throw new AppError(
        500,
        "EMISSIONS_DATA_INTEGRITY_ERROR",
        `Missing Scope 1 emission factor for activity "${activity}" (mapped from fuel type "${fuelType}").`,
      );
    }
    if (factor.scope !== 1) {
      throw new AppError(
        500,
        "EMISSIONS_DATA_INTEGRITY_ERROR",
        `Emission factor "${activity}" must have scope 1, found scope ${factor.scope}.`,
      );
    }
    if (factor.unit !== "L") {
      throw new AppError(
        500,
        "EMISSIONS_DATA_INTEGRITY_ERROR",
        `Emission factor "${activity}" must have unit "L", found "${factor.unit}".`,
      );
    }
  }

  const gridFactor = byActivity.get(GRID_ELECTRICITY_FACTOR_ACTIVITY);
  if (!gridFactor) {
    throw new AppError(
      500,
      "EMISSIONS_DATA_INTEGRITY_ERROR",
      `Missing Scope 2 emission factor for activity "${GRID_ELECTRICITY_FACTOR_ACTIVITY}".`,
    );
  }
  if (gridFactor.scope !== 2) {
    throw new AppError(
      500,
      "EMISSIONS_DATA_INTEGRITY_ERROR",
      `Emission factor "${GRID_ELECTRICITY_FACTOR_ACTIVITY}" must have scope 2, found scope ${gridFactor.scope}.`,
    );
  }
  if (gridFactor.unit !== "kWh") {
    throw new AppError(
      500,
      "EMISSIONS_DATA_INTEGRITY_ERROR",
      `Emission factor "${GRID_ELECTRICITY_FACTOR_ACTIVITY}" must have unit "kWh", found "${gridFactor.unit}".`,
    );
  }
}

export function calculateScope1Kg(
  fuelRows: FuelActivityInput[],
  factors: FactorInput[],
): { kgCo2e: number; litres: number } {
  const byActivity = indexFactorsByActivity(factors);
  let kgCo2e = 0;
  let litres = 0;

  for (const row of fuelRows) {
    const activity = factorActivityForFuelType(row.fuelType);
    if (!activity) {
      throw new AppError(
        500,
        "EMISSIONS_DATA_INTEGRITY_ERROR",
        `No emission-factor mapping configured for fuel type "${row.fuelType}".`,
      );
    }
    const factor = byActivity.get(activity);
    if (!factor) {
      throw new AppError(
        500,
        "EMISSIONS_DATA_INTEGRITY_ERROR",
        `Missing Scope 1 emission factor for activity "${activity}".`,
      );
    }
    litres += row.quantityLitres;
    kgCo2e += row.quantityLitres * factor.kgCo2ePerUnit;
  }

  return { kgCo2e, litres };
}

export function calculateScope2Kg(
  electricityRows: ElectricityActivityInput[],
  factors: FactorInput[],
): { kgCo2e: number; kwh: number } {
  const factor = factors.find((row) => row.activity === GRID_ELECTRICITY_FACTOR_ACTIVITY);
  if (!factor) {
    throw new AppError(
      500,
      "EMISSIONS_DATA_INTEGRITY_ERROR",
      `Missing Scope 2 emission factor for activity "${GRID_ELECTRICITY_FACTOR_ACTIVITY}".`,
    );
  }

  let kgCo2e = 0;
  let kwh = 0;
  for (const row of electricityRows) {
    kwh += row.consumptionKwh;
    kgCo2e += row.consumptionKwh * factor.kgCo2ePerUnit;
  }
  return { kgCo2e, kwh };
}

export function calculateMonthlyEmissions(
  monthlyFuel: MonthlyFuelInput[],
  monthlyElectricity: MonthlyElectricityInput[],
  factors: FactorInput[],
): Array<{
  month: string;
  scope1KgCo2e: number;
  scope2KgCo2e: number;
  totalKgCo2e: number;
  scope1TonnesCo2e: number;
  scope2TonnesCo2e: number;
  totalTonnesCo2e: number;
}> {
  assertEmissionsConfiguration(
    monthlyFuel.map((row) => row.fuelType),
    factors,
  );

  const byActivity = indexFactorsByActivity(factors);
  const gridFactor = byActivity.get(GRID_ELECTRICITY_FACTOR_ACTIVITY)!;
  const scope1ByMonth = new Map<string, number>();
  const scope2ByMonth = new Map<string, number>();

  for (const row of monthlyFuel) {
    const activity = factorActivityForFuelType(row.fuelType)!;
    const factor = byActivity.get(activity)!;
    const kg = row.quantityLitres * factor.kgCo2ePerUnit;
    scope1ByMonth.set(row.month, (scope1ByMonth.get(row.month) ?? 0) + kg);
  }

  for (const row of monthlyElectricity) {
    const kg = row.consumptionKwh * gridFactor.kgCo2ePerUnit;
    scope2ByMonth.set(row.month, (scope2ByMonth.get(row.month) ?? 0) + kg);
  }

  return buildMonthRange().map((month) => {
    const scope1KgCo2e = roundKgCo2e(scope1ByMonth.get(month) ?? 0);
    const scope2KgCo2e = roundKgCo2e(scope2ByMonth.get(month) ?? 0);
    const totalKgCo2e = roundKgCo2e(scope1KgCo2e + scope2KgCo2e);
    return {
      month,
      scope1KgCo2e,
      scope2KgCo2e,
      totalKgCo2e,
      scope1TonnesCo2e: roundTonnesCo2e(kgToTonnes(scope1KgCo2e)),
      scope2TonnesCo2e: roundTonnesCo2e(kgToTonnes(scope2KgCo2e)),
      totalTonnesCo2e: roundTonnesCo2e(kgToTonnes(totalKgCo2e)),
    };
  });
}

export function serialiseEmissionsSummary(input: {
  ingestionRunId: string;
  scope1Kg: number;
  scope2Kg: number;
  litres: number;
  kwh: number;
  factors: FactorInput[];
}) {
  const scope1KgCo2e = roundKgCo2e(input.scope1Kg);
  const scope2KgCo2e = roundKgCo2e(input.scope2Kg);
  const totalKgCo2e = roundKgCo2e(scope1KgCo2e + scope2KgCo2e);

  return {
    ingestionRunId: input.ingestionRunId,
    units: {
      activityFuel: "litres",
      activityElectricity: "kWh",
      emissions: "kg CO2e",
      emissionsTonnes: "t CO2e",
    },
    scope1: {
      activityLitres: roundActivity(input.litres),
      emissionsKgCo2e: scope1KgCo2e,
      emissionsTonnesCo2e: roundTonnesCo2e(kgToTonnes(scope1KgCo2e)),
    },
    scope2: {
      activityKwh: roundActivity(input.kwh),
      emissionsKgCo2e: scope2KgCo2e,
      emissionsTonnesCo2e: roundTonnesCo2e(kgToTonnes(scope2KgCo2e)),
    },
    combined: {
      emissionsKgCo2e: totalKgCo2e,
      emissionsTonnesCo2e: roundTonnesCo2e(kgToTonnes(totalKgCo2e)),
    },
    factorsUsed: input.factors.map((factor) => ({
      activity: factor.activity,
      scope: factor.scope,
      unit: factor.unit,
      kgCo2ePerUnit: factor.kgCo2ePerUnit,
      factorSource: factor.factorSource,
      sourceFilename: factor.sourceFilename,
      sourceRow: factor.sourceRow,
    })),
    factorMatching: {
      fuelTypeToActivity: { ...FUEL_TYPE_TO_FACTOR_ACTIVITY },
      electricityActivity: GRID_ELECTRICITY_FACTOR_ACTIVITY,
    },
    scope3: {
      calculated: false,
      reason:
        "Scope 3 is not calculated because no suitable supplier emission factors were supplied.",
    },
    dataQualityCaveats: [
      "Exact duplicate fuel deliveries are excluded from Scope 1 (include_in_emissions = false).",
      "Negative fuel credit/reversal quantities are retained and reduce Scope 1 totals.",
      "MTR-07 electricity readings after the Oct 2025 scale shift remain included unchanged and may understate Scope 2.",
      "November 2025 has no included fuel activity (documented fuel month gap).",
    ],
  };
}

export function mapFactorRows(
  rows: Array<{
    activity: string;
    scope: number;
    unit: string;
    kg_co2e_per_unit: string;
    factor_source: string;
    source_filename: string;
    source_row: number;
  }>,
): FactorInput[] {
  return rows.map((row) => ({
    activity: row.activity,
    scope: row.scope,
    unit: row.unit,
    kgCo2ePerUnit: parseRequiredNumeric(row.kg_co2e_per_unit),
    factorSource: row.factor_source,
    sourceFilename: row.source_filename,
    sourceRow: row.source_row,
  }));
}
