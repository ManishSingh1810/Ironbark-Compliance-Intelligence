import { runIngestionCli } from "./run-ingestion.js";

runIngestionCli().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
