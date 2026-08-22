import type pg from "pg";

import type { QualityIssueDraft } from "../types.js";
import type { ParsedElectricityRow } from "../parsers/electricity.js";
import type { ParsedEmissionFactorRow } from "../parsers/emission-factors.js";
import type { ParsedFuelRow } from "../parsers/fuel.js";
import type { ParsedIncidentRow } from "../parsers/incidents.js";
import type { ParsedSupplierRow } from "../parsers/suppliers.js";

export async function createIngestionRun(client: pg.PoolClient): Promise<string> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO ingestion_runs (status) VALUES ('running') RETURNING id`,
  );
  const id = result.rows[0]?.id;
  if (!id) {
    throw new Error("Failed to create ingestion run");
  }
  return id;
}

export async function completeIngestionRun(
  client: pg.PoolClient,
  runId: string,
): Promise<void> {
  await client.query(
    `UPDATE ingestion_runs SET status = 'completed', completed_at = NOW() WHERE id = $1`,
    [runId],
  );
}

export async function recordIngestionRunFile(
  client: pg.PoolClient,
  runId: string,
  sourceFilename: string,
  fileHash: string,
  rowCount: number,
): Promise<void> {
  await client.query(
    `INSERT INTO ingestion_run_files (ingestion_run_id, source_filename, file_hash, row_count)
     VALUES ($1, $2, $3, $4)`,
    [runId, sourceFilename, fileHash, rowCount],
  );
}

export async function insertFuelDelivery(
  client: pg.PoolClient,
  runId: string,
  sourceFilename: string,
  row: ParsedFuelRow,
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO fuel_deliveries (
      ingestion_run_id, source_filename, source_row,
      invoice_no_raw, delivery_date_raw, fuel_type_raw, quantity_raw, unit_raw, cost_aud_raw, site_area_raw,
      invoice_no, delivery_date, reporting_month, date_precision, fuel_type, quantity_litres, cost_aud, site_area,
      include_in_emissions
    ) VALUES (
      $1, $2, $3,
      $4, $5, $6, $7, $8, $9, $10,
      $11, $12, $13, $14, $15, $16, $17, $18,
      $19
    ) RETURNING id`,
    [
      runId,
      sourceFilename,
      row.sourceRow,
      row.invoiceNoRaw,
      row.deliveryDateRaw,
      row.fuelTypeRaw,
      row.quantityRaw,
      row.unitRaw,
      row.costAudRaw,
      row.siteAreaRaw,
      row.invoiceNo,
      row.deliveryDate,
      row.reportingMonth,
      row.datePrecision,
      row.fuelType,
      row.quantityLitres,
      row.costAud,
      row.siteArea,
      row.includeInEmissions,
    ],
  );
  const id = result.rows[0]?.id;
  if (!id) {
    throw new Error(`Failed to insert fuel row ${row.sourceRow}`);
  }
  return id;
}

export async function insertElectricityReading(
  client: pg.PoolClient,
  runId: string,
  sourceFilename: string,
  row: ParsedElectricityRow,
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO electricity_readings (
      ingestion_run_id, source_filename, source_row,
      meter_id_raw, meter_description_raw, period_raw, consumption_raw, unit_raw,
      meter_id, meter_description, period_month, consumption_kwh, include_in_emissions
    ) VALUES (
      $1, $2, $3,
      $4, $5, $6, $7, $8,
      $9, $10, $11, $12, $13
    ) RETURNING id`,
    [
      runId,
      sourceFilename,
      row.sourceRow,
      row.meterIdRaw,
      row.meterDescriptionRaw,
      row.periodRaw,
      row.consumptionRaw,
      row.unitRaw,
      row.meterId,
      row.meterDescription,
      row.periodMonth,
      row.consumptionKwh,
      row.includeInEmissions,
    ],
  );
  const id = result.rows[0]?.id;
  if (!id) {
    throw new Error(`Failed to insert electricity row ${row.sourceRow}`);
  }
  return id;
}

export async function insertIncident(
  client: pg.PoolClient,
  runId: string,
  sourceFilename: string,
  row: ParsedIncidentRow,
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO incidents (
      ingestion_run_id, source_filename, source_row,
      source_incident_id, incident_date_raw, location_raw, type_code_raw, severity_raw, description_raw,
      incident_date, location, type_code, severity_normalised, severity_label, description
    ) VALUES (
      $1, $2, $3,
      $4, $5, $6, $7, $8, $9,
      $10, $11, $12, $13, $14, $15
    ) RETURNING id`,
    [
      runId,
      sourceFilename,
      row.sourceRow,
      row.sourceIncidentIdRaw,
      row.incidentDateRaw,
      row.locationRaw,
      row.typeCodeRaw,
      row.severityRaw,
      row.descriptionRaw,
      row.incidentDate,
      row.location,
      row.typeCode,
      row.severityNormalised,
      row.severityLabel,
      row.description,
    ],
  );
  const id = result.rows[0]?.id;
  if (!id) {
    throw new Error(`Failed to insert incident row ${row.sourceRow}`);
  }
  return id;
}

export async function insertSupplier(
  client: pg.PoolClient,
  runId: string,
  sourceFilename: string,
  row: ParsedSupplierRow,
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO suppliers (
      ingestion_run_id, source_filename, source_row,
      supplier_name_raw, abn_raw, category_raw, fy_spend_aud_raw,
      supplier_name, abn, abn_digits, abn_valid, category, fy_spend_aud
    ) VALUES (
      $1, $2, $3,
      $4, $5, $6, $7,
      $8, $9, $10, $11, $12, $13
    ) RETURNING id`,
    [
      runId,
      sourceFilename,
      row.sourceRow,
      row.supplierNameRaw,
      row.abnRaw,
      row.categoryRaw,
      row.fySpendAudRaw,
      row.supplierName,
      row.abn,
      row.abnDigits || null,
      row.abnValid,
      row.category,
      row.fySpendAud,
    ],
  );
  const id = result.rows[0]?.id;
  if (!id) {
    throw new Error(`Failed to insert supplier row ${row.sourceRow}`);
  }
  return id;
}

export async function insertEmissionFactor(
  client: pg.PoolClient,
  runId: string,
  sourceFilename: string,
  row: ParsedEmissionFactorRow,
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO emission_factors (
      ingestion_run_id, source_filename, source_row,
      activity, scope, unit, kg_co2e_per_unit, factor_source
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [
      runId,
      sourceFilename,
      row.sourceRow,
      row.activity,
      row.scope,
      row.unit,
      row.kgCo2ePerUnit,
      row.factorSource,
    ],
  );
  const id = result.rows[0]?.id;
  if (!id) {
    throw new Error(`Failed to insert emission factor row ${row.sourceRow}`);
  }
  return id;
}

export async function insertQualityIssues(
  client: pg.PoolClient,
  runId: string,
  issues: QualityIssueDraft[],
): Promise<void> {
  for (const issue of issues) {
    await client.query(
      `INSERT INTO data_quality_issues (
        ingestion_run_id, entity_table, entity_id, source_filename, source_row,
        field_name, original_value, cleaned_value, action, issue_code, explanation
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        runId,
        issue.entityTable,
        issue.entityId,
        issue.sourceFilename,
        issue.sourceRow,
        issue.fieldName,
        issue.originalValue,
        issue.cleanedValue,
        issue.action,
        issue.issueCode,
        issue.explanation,
      ],
    );
  }
}

export async function recordFailedIngestionRun(
  client: pg.PoolClient,
  notes: string,
  files: Array<{ sourceFilename: string; fileHash: string; rowCount: number }>,
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO ingestion_runs (status, completed_at, notes)
     VALUES ('failed', NOW(), $1) RETURNING id`,
    [notes],
  );
  const runId = result.rows[0]?.id;
  if (!runId) {
    throw new Error("Failed to record failed ingestion run");
  }
  for (const file of files) {
    await recordIngestionRunFile(client, runId, file.sourceFilename, file.fileHash, file.rowCount);
  }
  return runId;
}
