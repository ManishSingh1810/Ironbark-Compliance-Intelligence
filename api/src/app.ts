import cors from "cors";
import express from "express";

import { loadConfig } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { apiRouter } from "./routes/api.js";

export function createApp() {
  const config = loadConfig();
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));

  const corsOrigin =
    config.frontendUrl ??
    (config.nodeEnv === "development" ? "http://localhost:5173" : undefined);

  if (corsOrigin) {
    app.use(
      cors({
        origin: corsOrigin,
        methods: ["GET", "HEAD", "OPTIONS"],
      }),
    );
  }

  app.get("/health", (_req, res) => {
    res.status(200).json({
      status: "ok",
      service: "ironbark-api",
      timestamp: new Date().toISOString(),
    });
  });

  app.use("/api", apiRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
