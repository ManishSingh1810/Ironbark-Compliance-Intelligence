import { Router } from "express";

import { asyncHandler } from "../middleware/error-handler.js";
import {
  dataQualityIssuesQuerySchema,
  evidenceParamsSchema,
  incidentsQuerySchema,
  parseOrThrow,
} from "../schemas/query.js";
import { getDataQualityIssues, getDataQualitySummary } from "../services/data-quality-service.js";
import { getEmissionsSummary, getMonthlyEmissions } from "../services/emissions-service.js";
import { getEvidence } from "../services/evidence-service.js";
import { getIncidents, getIncidentsSummary } from "../services/incidents-service.js";

export const apiRouter = Router();

apiRouter.get(
  "/emissions/summary",
  asyncHandler(async (_req, res) => {
    res.json(await getEmissionsSummary());
  }),
);

apiRouter.get(
  "/emissions/monthly",
  asyncHandler(async (_req, res) => {
    res.json(await getMonthlyEmissions());
  }),
);

apiRouter.get(
  "/incidents/summary",
  asyncHandler(async (_req, res) => {
    res.json(await getIncidentsSummary());
  }),
);

apiRouter.get(
  "/incidents",
  asyncHandler(async (req, res) => {
    const query = parseOrThrow(
      incidentsQuerySchema,
      req.query,
      "Invalid incidents query. Optional: severity (1|2|3|Low|Medium|High), type.",
    );
    res.json(await getIncidents({ severity: query.severity, type: query.type }));
  }),
);

apiRouter.get(
  "/data-quality/summary",
  asyncHandler(async (_req, res) => {
    res.json(await getDataQualitySummary());
  }),
);

apiRouter.get(
  "/data-quality/issues",
  asyncHandler(async (req, res) => {
    const query = parseOrThrow(
      dataQualityIssuesQuerySchema,
      req.query,
      "Invalid data-quality query. Optional: action, issueCode, sourceFilename, entityTable.",
    );
    res.json(await getDataQualityIssues(query));
  }),
);

apiRouter.get(
  "/evidence/:entityTable/:entityId",
  asyncHandler(async (req, res) => {
    const params = parseOrThrow(
      evidenceParamsSchema,
      req.params,
      "Invalid evidence path. entityTable must be whitelisted and entityId must be a UUID.",
    );
    res.json(await getEvidence(params.entityTable, params.entityId));
  }),
);
