import type { EntityTable } from "../domain/constants.js";
import { AppError } from "../errors.js";
import { query } from "../db/client.js";

/**
 * Whitelisted evidence tables. User-supplied names are validated against EntityTable
 * before lookup — SQL identifiers come only from this map.
 */
const EVIDENCE_TABLE_SQL: Record<EntityTable, { from: string; select: string }> = {
  fuel_deliveries: {
    from: "fuel_deliveries",
    select: `id, ingestion_run_id, source_filename, source_row,
      invoice_no_raw, delivery_date_raw, fuel_type_raw, quantity_raw, unit_raw, cost_aud_raw, site_area_raw,
      invoice_no, delivery_date, reporting_month, date_precision::text, fuel_type,
      quantity_litres::text, cost_aud::text, site_area, include_in_emissions, created_at`,
  },
  electricity_readings: {
    from: "electricity_readings",
    select: `id, ingestion_run_id, source_filename, source_row,
      meter_id_raw, meter_description_raw, period_raw, consumption_raw, unit_raw,
      meter_id, meter_description, period_month, consumption_kwh::text,
      include_in_emissions, created_at`,
  },
  incidents: {
    from: "incidents",
    select: `id, ingestion_run_id, source_filename, source_row,
      source_incident_id, incident_date_raw, location_raw, type_code_raw, severity_raw, description_raw,
      incident_date, location, type_code, severity_normalised, severity_label, description, created_at`,
  },
  suppliers: {
    from: "suppliers",
    select: `id, ingestion_run_id, source_filename, source_row,
      supplier_name_raw, abn_raw, category_raw, fy_spend_aud_raw,
      supplier_name, abn, abn_digits, abn_valid, category, fy_spend_aud::text, created_at`,
  },
  emission_factors: {
    from: "emission_factors",
    select: `id, ingestion_run_id, source_filename, source_row,
      activity, scope, unit, kg_co2e_per_unit::text, factor_source, created_at`,
  },
};

export async function findEvidenceRecord(
  runId: string,
  entityTable: EntityTable,
  entityId: string,
): Promise<Record<string, unknown> | null> {
  const mapping = EVIDENCE_TABLE_SQL[entityTable];
  if (!mapping) {
    throw new AppError(400, "INVALID_ENTITY_TABLE", `Unsupported entity table: ${entityTable}`);
  }

  const result = await query<Record<string, unknown>>(
    `SELECT ${mapping.select}
     FROM ${mapping.from}
     WHERE ingestion_run_id = $1 AND id = $2
     LIMIT 1`,
    [runId, entityId],
  );
  return result.rows[0] ?? null;
}
