import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { closePool, getPool } from "../db/client.js";
import {
  FUEL_GAP_MONTH,
  MISSING_METER_ID,
  SOURCE_FILES,
} from "../domain/constants.js";
import {
  completeIngestionRun,
  createIngestionRun,
  insertElectricityReading,
  insertEmissionFactor,
  insertFuelDelivery,
  insertIncident,
  insertQualityIssues,
  insertSupplier,
  recordFailedIngestionRun,
  recordIngestionRunFile,
} from "./db/repository.js";
import { findCompletedRunWithSameHashes } from "./db/rerun.js";
import { sha256File } from "./hash.js";
import {
  buildMissingMeterIssue,
  buildSiteElectricityDropIssue,
  meterIdsPresent,
  parseElectricityCsv,
  siteTotalForMonth,
  SITE_DROP_COMPARE_FROM,
  SITE_DROP_COMPARE_TO,
} from "./parsers/electricity.js";
import { parseEmissionFactorsCsv } from "./parsers/emission-factors.js";
import {
  buildFuelMonthGapIssue,
  fuelMonthsPresent,
  parseFuelCsv,
} from "./parsers/fuel.js";
import { parseIncidentsCsv } from "./parsers/incidents.js";
import { parseSuppliersCsv } from "./parsers/suppliers.js";
import type { QualityIssueDraft, SourceFileDescriptor } from "./types.js";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const dataDir = path.join(repoRoot, "data");

export interface IngestionResult {
  status: "skipped" | "completed" | "failed";
  runId?: string;
  message: string;
}

async function loadSourceFiles(): Promise<
  Array<SourceFileDescriptor & { content: string }>
> {
  const files: Array<SourceFileDescriptor & { content: string }> = [];

  for (const filename of SOURCE_FILES) {
    const absolutePath = path.join(dataDir, filename);
    const [content, hash] = await Promise.all([
      readFile(absolutePath, "utf8"),
      sha256File(absolutePath),
    ]);
    const rowCount = content.split(/\r?\n/).filter((line) => line.trim() !== "").length - 1;
    files.push({ filename, absolutePath, hash, rowCount, content });
  }

  return files;
}

function attachEntityIds<T extends { issues: QualityIssueDraft[] }>(
  rows: T[],
  ids: string[],
  entityTable: string,
  sourceFilename: string,
): QualityIssueDraft[] {
  const rowIssues: QualityIssueDraft[] = [];
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const entityId = ids[index];
    if (!row || !entityId) {
      continue;
    }
    for (const issue of row.issues) {
      rowIssues.push({
        ...issue,
        entityTable,
        entityId: issue.entityId ?? entityId,
        sourceFilename,
      });
    }
  }
  return rowIssues;
}

function toFailedRunFiles(
  descriptors: SourceFileDescriptor[],
): Array<{ sourceFilename: string; fileHash: string; rowCount: number }> {
  return descriptors.map((file) => ({
    sourceFilename: file.filename,
    fileHash: file.hash,
    rowCount: file.rowCount,
  }));
}

export async function runIngestion(): Promise<IngestionResult> {
  const sourceFiles = await loadSourceFiles();
  const descriptors: SourceFileDescriptor[] = sourceFiles.map(
    ({ filename, absolutePath, hash, rowCount }) => ({
      filename,
      absolutePath,
      hash,
      rowCount,
    }),
  );

  const existingRunId = await findCompletedRunWithSameHashes(descriptors);
  if (existingRunId) {
    return {
      status: "skipped",
      runId: existingRunId,
      message: `Source files unchanged; already ingested in run ${existingRunId}.`,
    };
  }

  const client = await getPool().connect();

  try {
    await client.query("BEGIN");
    const runId = await createIngestionRun(client);

    for (const file of descriptors) {
      await recordIngestionRunFile(client, runId, file.filename, file.hash, file.rowCount);
    }

    const fuelFile = sourceFiles.find((file) => file.filename === "fuel_deliveries.csv");
    const electricityFile = sourceFiles.find(
      (file) => file.filename === "electricity_meter_readings.csv",
    );
    const incidentsFile = sourceFiles.find((file) => file.filename === "incident_register.csv");
    const suppliersFile = sourceFiles.find((file) => file.filename === "suppliers.csv");
    const factorsFile = sourceFiles.find((file) => file.filename === "emission_factors.csv");

    if (!fuelFile || !electricityFile || !incidentsFile || !suppliersFile || !factorsFile) {
      throw new Error("Missing one or more required source files");
    }

    const fuelParsed = parseFuelCsv(fuelFile.content, fuelFile.filename);
    const electricityParsed = parseElectricityCsv(
      electricityFile.content,
      electricityFile.filename,
    );
    const incidentsParsed = parseIncidentsCsv(incidentsFile.content, incidentsFile.filename);
    const suppliersParsed = parseSuppliersCsv(suppliersFile.content, suppliersFile.filename);
    const factorsParsed = parseEmissionFactorsCsv(factorsFile.content, factorsFile.filename);

    const fileLevelIssues: QualityIssueDraft[] = [
      ...fuelParsed.headerIssues,
      ...electricityParsed.headerIssues,
      ...incidentsParsed.headerIssues,
      ...suppliersParsed.headerIssues,
      ...factorsParsed.headerIssues,
    ];

    if (!fuelMonthsPresent(fuelParsed.rows).has(FUEL_GAP_MONTH)) {
      fileLevelIssues.push(buildFuelMonthGapIssue(fuelFile.filename, FUEL_GAP_MONTH));
    }

    if (!meterIdsPresent(electricityParsed.rows).has(MISSING_METER_ID)) {
      fileLevelIssues.push(buildMissingMeterIssue(electricityFile.filename));
    }

    const febTotal = siteTotalForMonth(electricityParsed.rows, SITE_DROP_COMPARE_FROM);
    const marTotal = siteTotalForMonth(electricityParsed.rows, SITE_DROP_COMPARE_TO);
    if (febTotal > 0 && marTotal < febTotal * 0.5) {
      fileLevelIssues.push(
        buildSiteElectricityDropIssue(
          electricityFile.filename,
          SITE_DROP_COMPARE_FROM,
          SITE_DROP_COMPARE_TO,
          febTotal,
          marTotal,
        ),
      );
    }

    const fuelIds: string[] = [];
    for (const row of fuelParsed.rows) {
      fuelIds.push(await insertFuelDelivery(client, runId, fuelFile.filename, row));
    }

    const electricityIds: string[] = [];
    for (const row of electricityParsed.rows) {
      electricityIds.push(
        await insertElectricityReading(client, runId, electricityFile.filename, row),
      );
    }

    const incidentIds: string[] = [];
    for (const row of incidentsParsed.rows) {
      incidentIds.push(await insertIncident(client, runId, incidentsFile.filename, row));
    }

    const supplierIds: string[] = [];
    for (const row of suppliersParsed.rows) {
      supplierIds.push(await insertSupplier(client, runId, suppliersFile.filename, row));
    }

    const factorIds: string[] = [];
    for (const row of factorsParsed.rows) {
      factorIds.push(await insertEmissionFactor(client, runId, factorsFile.filename, row));
    }

    const allIssues: QualityIssueDraft[] = [
      ...fileLevelIssues,
      ...attachEntityIds(fuelParsed.rows, fuelIds, "fuel_deliveries", fuelFile.filename),
      ...attachEntityIds(
        electricityParsed.rows,
        electricityIds,
        "electricity_readings",
        electricityFile.filename,
      ),
      ...attachEntityIds(incidentsParsed.rows, incidentIds, "incidents", incidentsFile.filename),
      ...attachEntityIds(suppliersParsed.rows, supplierIds, "suppliers", suppliersFile.filename),
      ...attachEntityIds(
        factorsParsed.rows,
        factorIds,
        "emission_factors",
        factorsFile.filename,
      ),
    ];

    await insertQualityIssues(client, runId, allIssues);
    await completeIngestionRun(client, runId);
    await client.query("COMMIT");

    return {
      status: "completed",
      runId,
      message: `Ingestion completed successfully (run ${runId}).`,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    const message = error instanceof Error ? error.message : String(error);

    try {
      await client.query("BEGIN");
      const failedRunId = await recordFailedIngestionRun(
        client,
        message,
        toFailedRunFiles(descriptors),
      );
      await client.query("COMMIT");
      return {
        status: "failed",
        runId: failedRunId,
        message: `Ingestion failed and was rolled back. Failure recorded in run ${failedRunId}.`,
      };
    } catch (recordError) {
      await client.query("ROLLBACK");
      throw recordError;
    }
  } finally {
    client.release();
  }
}

export async function runIngestionCli(): Promise<void> {
  try {
    const result = await runIngestion();
    console.log(result.message);
    if (result.status === "failed") {
      process.exitCode = 1;
    }
  } finally {
    await closePool();
  }
}
