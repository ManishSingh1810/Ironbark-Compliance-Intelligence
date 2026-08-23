import { describe, expect, it } from "vitest";

import { AppError } from "../errors.js";
import {
  FUEL_TYPE_TO_FACTOR_ACTIVITY,
  GRID_ELECTRICITY_FACTOR_ACTIVITY,
} from "../domain/factor-mapping.js";
import { parseRequiredNumeric } from "../serializers/numbers.js";
import {
  assertEmissionsConfiguration,
  buildMonthRange,
  calculateMonthlyEmissions,
  calculateScope1Kg,
  calculateScope2Kg,
  serialiseEmissionsSummary,
  type FactorInput,
} from "./emissions-calc.js";

const FACTORS: FactorInput[] = [
  {
    activity: FUEL_TYPE_TO_FACTOR_ACTIVITY.Diesel!,
    scope: 1,
    unit: "L",
    kgCo2ePerUnit: 2.7,
    factorSource: "test",
    sourceFilename: "emission_factors.csv",
    sourceRow: 2,
  },
  {
    activity: FUEL_TYPE_TO_FACTOR_ACTIVITY["Petrol (ULP)"]!,
    scope: 1,
    unit: "L",
    kgCo2ePerUnit: 2.31,
    factorSource: "test",
    sourceFilename: "emission_factors.csv",
    sourceRow: 3,
  },
  {
    activity: GRID_ELECTRICITY_FACTOR_ACTIVITY,
    scope: 2,
    unit: "kWh",
    kgCo2ePerUnit: 0.71,
    factorSource: "test",
    sourceFilename: "emission_factors.csv",
    sourceRow: 4,
  },
];

describe("emissions calculations", () => {
  it("Scope 1 uses quantity_litres × matching supplied diesel/petrol factors", () => {
    const result = calculateScope1Kg(
      [
        { fuelType: "Diesel", quantityLitres: 100 },
        { fuelType: "Petrol (ULP)", quantityLitres: 50 },
      ],
      FACTORS,
    );
    expect(result.kgCo2e).toBeCloseTo(100 * 2.7 + 50 * 2.31, 8);
    expect(result.litres).toBe(150);
  });

  it("Scope 2 uses consumption_kwh × Queensland grid factor", () => {
    const result = calculateScope2Kg([{ consumptionKwh: 1000 }], FACTORS);
    expect(result.kgCo2e).toBeCloseTo(1000 * 0.71, 8);
    expect(result.kwh).toBe(1000);
  });

  it("negative credit/reversal reduces Scope 1 totals", () => {
    const result = calculateScope1Kg(
      [
        { fuelType: "Diesel", quantityLitres: 1000 },
        { fuelType: "Diesel", quantityLitres: -12500 },
      ],
      FACTORS,
    );
    expect(result.kgCo2e).toBeCloseTo((1000 - 12500) * 2.7, 8);
    expect(result.litres).toBe(1000 - 12500);
  });

  it("excluded duplicate fuel rows do not contribute when omitted from inputs", () => {
    const includedOnly = calculateScope1Kg(
      [{ fuelType: "Diesel", quantityLitres: 500 }],
      FACTORS,
    );
    expect(includedOnly.kgCo2e).toBeCloseTo(500 * 2.7, 8);
  });

  it("monthly aggregation includes all 18 months and zero-fills gaps", () => {
    const months = calculateMonthlyEmissions(
      [{ month: "2025-01", fuelType: "Diesel", quantityLitres: 10 }],
      [{ month: "2025-02", consumptionKwh: 100 }],
      FACTORS,
    );
    expect(buildMonthRange()).toHaveLength(18);
    expect(months).toHaveLength(18);
    expect(months[0]?.month).toBe("2025-01");
    expect(months[17]?.month).toBe("2026-06");
    const nov = months.find((row) => row.month === "2025-11");
    expect(nov?.scope1KgCo2e).toBe(0);
    expect(nov?.scope2KgCo2e).toBe(0);
    expect(months[0]?.scope1KgCo2e).toBeCloseTo(10 * 2.7, 8);
    expect(months[1]?.scope2KgCo2e).toBeCloseTo(100 * 0.71, 8);
  });

  it("combined total equals Scope 1 + Scope 2", () => {
    const summary = serialiseEmissionsSummary({
      ingestionRunId: "00000000-0000-0000-0000-000000000001",
      scope1Kg: 1000,
      scope2Kg: 250.5,
      litres: 100,
      kwh: 200,
      factors: FACTORS,
    });
    expect(summary.combined.emissionsKgCo2e).toBeCloseTo(
      summary.scope1.emissionsKgCo2e + summary.scope2.emissionsKgCo2e,
      8,
    );
    expect(summary.scope3.calculated).toBe(false);
  });

  it("keeps existing real-data calculation behaviour unchanged for known factors", () => {
    const litres = 8178522;
    const dieselShare = 0.95;
    const petrolShare = 0.05;
    const dieselLitres = litres * dieselShare;
    const petrolLitres = litres * petrolShare;
    const kwh = 32863712.8;

    const scope1 = calculateScope1Kg(
      [
        { fuelType: "Diesel", quantityLitres: dieselLitres },
        { fuelType: "Petrol (ULP)", quantityLitres: petrolLitres },
      ],
      FACTORS,
    );
    const scope2 = calculateScope2Kg([{ consumptionKwh: kwh }], FACTORS);

    expect(scope1.kgCo2e).toBeCloseTo(dieselLitres * 2.7 + petrolLitres * 2.31, 8);
    expect(scope2.kgCo2e).toBeCloseTo(kwh * 0.71, 8);
    expect(scope1.kgCo2e + scope2.kgCo2e).toBeCloseTo(
      dieselLitres * 2.7 + petrolLitres * 2.31 + kwh * 0.71,
      8,
    );
  });
});

describe("emissions configuration integrity", () => {
  it("unknown fuel type causes an emissions data-integrity error rather than being skipped", () => {
    expect(() =>
      assertEmissionsConfiguration(["Biodiesel"], FACTORS),
    ).toThrow(AppError);

    try {
      assertEmissionsConfiguration(["Biodiesel"], FACTORS);
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe("EMISSIONS_DATA_INTEGRITY_ERROR");
      expect((error as AppError).statusCode).toBe(500);
      expect((error as AppError).message).toContain("Biodiesel");
    }

    expect(() =>
      calculateScope1Kg([{ fuelType: "Biodiesel", quantityLitres: 10 }], FACTORS),
    ).toThrow(/Biodiesel/);
  });

  it("missing diesel factor causes an error", () => {
    const withoutDiesel = FACTORS.filter(
      (factor) => factor.activity !== FUEL_TYPE_TO_FACTOR_ACTIVITY.Diesel,
    );
    expect(() => assertEmissionsConfiguration(["Diesel"], withoutDiesel)).toThrow(
      /Diesel combustion/,
    );
  });

  it("missing petrol factor causes an error", () => {
    const withoutPetrol = FACTORS.filter(
      (factor) => factor.activity !== FUEL_TYPE_TO_FACTOR_ACTIVITY["Petrol (ULP)"],
    );
    expect(() => assertEmissionsConfiguration([], withoutPetrol)).toThrow(
      /Petrol \(ULP\) combustion/,
    );
  });

  it("missing electricity factor causes an error", () => {
    const withoutGrid = FACTORS.filter(
      (factor) => factor.activity !== GRID_ELECTRICITY_FACTOR_ACTIVITY,
    );
    expect(() => assertEmissionsConfiguration(["Diesel"], withoutGrid)).toThrow(
      /Grid electricity - Queensland/,
    );
  });

  it("wrong factor scope or unit causes an error", () => {
    const wrongScope: FactorInput[] = FACTORS.map((factor) =>
      factor.activity === FUEL_TYPE_TO_FACTOR_ACTIVITY.Diesel
        ? { ...factor, scope: 2 }
        : factor,
    );
    expect(() => assertEmissionsConfiguration(["Diesel"], wrongScope)).toThrow(/scope 1/);

    const wrongUnit: FactorInput[] = FACTORS.map((factor) =>
      factor.activity === GRID_ELECTRICITY_FACTOR_ACTIVITY
        ? { ...factor, unit: "MWh" }
        : factor,
    );
    expect(() => assertEmissionsConfiguration(["Diesel"], wrongUnit)).toThrow(/kWh/);
  });

  it("monthly calculation validates fuel types before aggregating", () => {
    expect(() =>
      calculateMonthlyEmissions(
        [{ month: "2025-01", fuelType: "UnknownFuel", quantityLitres: 1 }],
        [],
        FACTORS,
      ),
    ).toThrow(AppError);
  });
});

describe("parseRequiredNumeric", () => {
  it("invalid numeric database values throw instead of becoming zero", () => {
    expect(() => parseRequiredNumeric(null)).toThrow();
    expect(() => parseRequiredNumeric(undefined)).toThrow();
    expect(() => parseRequiredNumeric("")).toThrow();
    expect(() => parseRequiredNumeric("not-a-number")).toThrow();
    expect(() => parseRequiredNumeric(Number.NaN)).toThrow();
    expect(() => parseRequiredNumeric(Number.POSITIVE_INFINITY)).toThrow();
  });

  it("a genuine numeric zero remains valid", () => {
    expect(parseRequiredNumeric(0)).toBe(0);
    expect(parseRequiredNumeric("0")).toBe(0);
    expect(parseRequiredNumeric("0.000")).toBe(0);
  });
});
