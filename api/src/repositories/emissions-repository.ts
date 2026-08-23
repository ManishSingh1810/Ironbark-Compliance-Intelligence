import { query } from "../db/client.js";

export interface EmissionFactorRow {
  id: string;
  activity: string;
  scope: number;
  unit: string;
  kg_co2e_per_unit: string;
  factor_source: string;
  source_filename: string;
  source_row: number;
}

export interface FuelActivityRow {
  fuel_type: string;
  quantity_litres: string;
  reporting_month: Date | null;
  delivery_date: Date | null;
}

export interface ElectricityActivityRow {
  consumption_kwh: string;
  period_month: Date;
}

export interface MonthlyFuelAggRow {
  month: string;
  fuel_type: string;
  quantity_litres: string;
}

export interface MonthlyElectricityAggRow {
  month: string;
  consumption_kwh: string;
}

export async function listEmissionFactors(runId: string): Promise<EmissionFactorRow[]> {
  const result = await query<EmissionFactorRow>(
    `SELECT id, activity, scope, unit, kg_co2e_per_unit::text, factor_source,
            source_filename, source_row
     FROM emission_factors
     WHERE ingestion_run_id = $1
     ORDER BY scope, activity`,
    [runId],
  );
  return result.rows;
}

export async function listIncludedFuelActivity(runId: string): Promise<FuelActivityRow[]> {
  const result = await query<FuelActivityRow>(
    `SELECT fuel_type, quantity_litres::text, reporting_month, delivery_date
     FROM fuel_deliveries
     WHERE ingestion_run_id = $1
       AND include_in_emissions = TRUE`,
    [runId],
  );
  return result.rows;
}

export async function listIncludedElectricityActivity(
  runId: string,
): Promise<ElectricityActivityRow[]> {
  const result = await query<ElectricityActivityRow>(
    `SELECT consumption_kwh::text, period_month
     FROM electricity_readings
     WHERE ingestion_run_id = $1
       AND include_in_emissions = TRUE`,
    [runId],
  );
  return result.rows;
}

export async function listMonthlyFuelByType(runId: string): Promise<MonthlyFuelAggRow[]> {
  const result = await query<MonthlyFuelAggRow>(
    `SELECT to_char(
              COALESCE(reporting_month, date_trunc('month', delivery_date)::date),
              'YYYY-MM'
            ) AS month,
            fuel_type,
            SUM(quantity_litres)::text AS quantity_litres
     FROM fuel_deliveries
     WHERE ingestion_run_id = $1
       AND include_in_emissions = TRUE
       AND COALESCE(reporting_month, delivery_date) IS NOT NULL
     GROUP BY 1, fuel_type
     ORDER BY 1, fuel_type`,
    [runId],
  );
  return result.rows;
}

export async function listMonthlyElectricity(runId: string): Promise<MonthlyElectricityAggRow[]> {
  const result = await query<MonthlyElectricityAggRow>(
    `SELECT to_char(period_month, 'YYYY-MM') AS month,
            SUM(consumption_kwh)::text AS consumption_kwh
     FROM electricity_readings
     WHERE ingestion_run_id = $1
       AND include_in_emissions = TRUE
     GROUP BY 1
     ORDER BY 1`,
    [runId],
  );
  return result.rows;
}
