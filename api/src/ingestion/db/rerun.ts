import { query } from "../../db/client.js";
import { SOURCE_FILES } from "../../domain/constants.js";
import type { SourceFileDescriptor } from "../types.js";

function hashMapKey(files: SourceFileDescriptor[]): string {
  return [...files]
    .sort((a, b) => a.filename.localeCompare(b.filename))
    .map((file) => `${file.filename}:${file.hash}`)
    .join("|");
}

export async function findCompletedRunWithSameHashes(
  files: SourceFileDescriptor[],
): Promise<string | null> {
  if (files.length !== SOURCE_FILES.length) {
    throw new Error(`Expected ${SOURCE_FILES.length} source files`);
  }

  const expected = new Map(files.map((file) => [file.filename, file.hash]));
  const result = await query<{ run_id: string; source_filename: string; file_hash: string }>(
    `SELECT ir.id AS run_id, irf.source_filename, irf.file_hash
     FROM ingestion_runs ir
     INNER JOIN ingestion_run_files irf ON irf.ingestion_run_id = ir.id
     WHERE ir.status = 'completed'`,
  );

  const grouped = new Map<string, Map<string, string>>();
  for (const row of result.rows) {
    const hashes = grouped.get(row.run_id) ?? new Map<string, string>();
    hashes.set(row.source_filename, row.file_hash);
    grouped.set(row.run_id, hashes);
  }

  for (const [runId, hashes] of grouped) {
    if (hashes.size !== expected.size) {
      continue;
    }
    let matches = true;
    for (const [filename, hash] of expected) {
      if (hashes.get(filename) !== hash) {
        matches = false;
        break;
      }
    }
    if (matches) {
      return runId;
    }
  }

  return null;
}

export function describeFileSet(files: SourceFileDescriptor[]): string {
  return hashMapKey(files);
}
