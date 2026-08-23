import { AppError } from "../errors.js";
import { query } from "../db/client.js";

export interface IngestionRunRow {
  id: string;
  status: string;
  started_at: Date;
  completed_at: Date | null;
}

/**
 * Latest completed ingestion run:
 * completed_at DESC, then started_at DESC as tie-breaker.
 */
export async function findLatestCompletedRunId(): Promise<string> {
  try {
    const result = await query<IngestionRunRow>(
      `SELECT id, status::text, started_at, completed_at
       FROM ingestion_runs
       WHERE status = 'completed'
       ORDER BY completed_at DESC NULLS LAST, started_at DESC
       LIMIT 1`,
    );
    const run = result.rows[0];
    if (!run) {
      throw new AppError(
        503,
        "NO_COMPLETED_INGESTION_RUN",
        "No completed ingestion run is available. Ingest source data before querying compliance metrics.",
      );
    }
    return run.id;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(
      503,
      "DATABASE_UNAVAILABLE",
      "The database is currently unavailable.",
    );
  }
}
