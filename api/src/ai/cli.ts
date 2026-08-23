import { runIncidentClassificationCli } from "./run-classify-cli.js";

runIncidentClassificationCli().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
