import { AppError, isAppError } from "../errors.js";
import { parseRequiredNumeric } from "../serializers/numbers.js";
import { findLatestCompletedRunId } from "../repositories/ingestion-run-repository.js";
import {
  listEmissionFactors,
  listIncludedElectricityActivity,
  listIncludedFuelActivity,
  listMonthlyElectricity,
  listMonthlyFuelByType,
} from "../repositories/emissions-repository.js";
import {
  assertEmissionsConfiguration,
  calculateMonthlyEmissions,
  calculateScope1Kg,
  calculateScope2Kg,
  mapFactorRows,
  serialiseEmissionsSummary,
  type FactorInput,
} from "./emissions-calc.js";

function emissionsNumeric(value: string | number | null | undefined, field: string): number {
  try {
    return parseRequiredNumeric(value);
  } catch {
    throw new AppError(
      500,
      "EMISSIONS_DATA_INTEGRITY_ERROR",
      `Invalid or missing numeric value for ${field}.`,
    );
  }
}

function mapFactorsOrThrow(
  rows: Parameters<typeof mapFactorRows>[0],
): FactorInput[] {
  try {
    return mapFactorRows(rows);
  } catch (error) {
    if (isAppError(error)) {
      throw error;
    }
    throw new AppError(
      500,
      "EMISSIONS_DATA_INTEGRITY_ERROR",
      "Invalid or missing numeric value for emission factor kg_co2e_per_unit.",
    );
  }
}

export async function getEmissionsSummary() {
  const ingestionRunId = await findLatestCompletedRunId();
  const [factorRows, fuelRows, electricityRows] = await Promise.all([
    listEmissionFactors(ingestionRunId),
    listIncludedFuelActivity(ingestionRunId),
    listIncludedElectricityActivity(ingestionRunId),
  ]);

  const factors = mapFactorsOrThrow(factorRows);
  assertEmissionsConfiguration(
    fuelRows.map((row) => row.fuel_type),
    factors,
  );

  const scope1 = calculateScope1Kg(
    fuelRows.map((row) => ({
      fuelType: row.fuel_type,
      quantityLitres: emissionsNumeric(row.quantity_litres, "fuel quantity_litres"),
    })),
    factors,
  );
  const scope2 = calculateScope2Kg(
    electricityRows.map((row) => ({
      consumptionKwh: emissionsNumeric(row.consumption_kwh, "electricity consumption_kwh"),
    })),
    factors,
  );

  return serialiseEmissionsSummary({
    ingestionRunId,
    scope1Kg: scope1.kgCo2e,
    scope2Kg: scope2.kgCo2e,
    litres: scope1.litres,
    kwh: scope2.kwh,
    factors,
  });
}

export async function getMonthlyEmissions() {
  const ingestionRunId = await findLatestCompletedRunId();
  const [factorRows, monthlyFuel, monthlyElectricity] = await Promise.all([
    listEmissionFactors(ingestionRunId),
    listMonthlyFuelByType(ingestionRunId),
    listMonthlyElectricity(ingestionRunId),
  ]);

  const factors = mapFactorsOrThrow(factorRows);
  assertEmissionsConfiguration(
    monthlyFuel.map((row) => row.fuel_type),
    factors,
  );

  const months = calculateMonthlyEmissions(
    monthlyFuel.map((row) => ({
      month: row.month,
      fuelType: row.fuel_type,
      quantityLitres: emissionsNumeric(row.quantity_litres, "monthly fuel quantity_litres"),
    })),
    monthlyElectricity.map((row) => ({
      month: row.month,
      consumptionKwh: emissionsNumeric(
        row.consumption_kwh,
        "monthly electricity consumption_kwh",
      ),
    })),
    factors,
  );

  return {
    ingestionRunId,
    units: {
      emissions: "kg CO2e",
      emissionsTonnes: "t CO2e",
    },
    months,
  };
}
