import { config } from "dotenv";
import { fileURLToPath } from "node:url";

config({
  path: fileURLToPath(new URL("../../../.env", import.meta.url)),
  quiet: true,
});

export interface AppConfig {
  port: number;
  nodeEnv: string;
  frontendUrl: string | undefined;
  databaseUrl: string | undefined;
}

export function loadConfig(): AppConfig {
  const port = Number(process.env.PORT ?? "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT: ${process.env.PORT ?? ""}`);
  }

  return {
    port,
    nodeEnv: process.env.NODE_ENV ?? "development",
    frontendUrl: process.env.FRONTEND_URL?.trim() || undefined,
    databaseUrl: process.env.DATABASE_URL,
  };
}
