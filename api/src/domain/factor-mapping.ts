/**
 * Explicit mapping from normalised fuel_type values stored in fuel_deliveries
 * to emission_factors.activity names loaded from emission_factors.csv.
 *
 * Verified against Neon for the completed ingestion run:
 * - fuel_type values: "Diesel", "Petrol (ULP)"
 * - factor activities: "Diesel combustion (stationary & transport)",
 *   "Petrol (ULP) combustion", "Grid electricity - Queensland"
 */
export const FUEL_TYPE_TO_FACTOR_ACTIVITY: Readonly<Record<string, string>> = {
  Diesel: "Diesel combustion (stationary & transport)",
  "Petrol (ULP)": "Petrol (ULP) combustion",
};

/** Scope 2 factor activity name from emission_factors.csv / Neon. */
export const GRID_ELECTRICITY_FACTOR_ACTIVITY = "Grid electricity - Queensland";

export function factorActivityForFuelType(fuelType: string): string | undefined {
  return FUEL_TYPE_TO_FACTOR_ACTIVITY[fuelType];
}
