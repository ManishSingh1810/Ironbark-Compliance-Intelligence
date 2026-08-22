import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { closePool, query } from "./client.js";

const migrationsDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../migrations",
);

async function listMigrationFiles(): Promise<string[]> {
  const entries = await readdir(migrationsDir);
  return entries.filter((name) => name.endsWith(".sql")).sort();
}

async function getAppliedMigrations(): Promise<Set<string>> {
  const result = await query<{ filename: string }>(
    "SELECT filename FROM schema_migrations ORDER BY filename",
  );
  return new Set(result.rows.map((row) => row.filename));
}

async function applyMigration(filename: string): Promise<void> {
  const filePath = path.join(migrationsDir, filename);
  const sql = await readFile(filePath, "utf8");

  await query("BEGIN");
  try {
    await query(sql);
    await query("INSERT INTO schema_migrations (filename) VALUES ($1)", [filename]);
    await query("COMMIT");
    console.log(`Applied migration: ${filename}`);
  } catch (error) {
    await query("ROLLBACK");
    throw error;
  }
}

async function ensureMigrationsTable(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function runMigrations(): Promise<void> {
  await ensureMigrationsTable();

  const files = await listMigrationFiles();
  const applied = await getAppliedMigrations();

  for (const filename of files) {
    if (applied.has(filename)) {
      console.log(`Skipped (already applied): ${filename}`);
      continue;
    }

    await applyMigration(filename);
  }
}

async function main(): Promise<void> {
  try {
    await runMigrations();
  } finally {
    await closePool();
  }
}

const isDirectExecution = process.argv[1] === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
