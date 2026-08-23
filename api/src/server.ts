import { createApp } from "./app.js";
import { loadConfig } from "./config/env.js";
import { closePool } from "./db/client.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const app = createApp();

  const server = app.listen(config.port, () => {
    console.log(`Ironbark API listening on http://localhost:${config.port}`);
  });

  const shutdown = (signal: string): void => {
    console.log(`Received ${signal}; shutting down`);
    server.close(() => {
      void closePool().finally(() => process.exit(0));
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
