import { PROMPT_VERSION, hasOpenAiConfig } from "../ai/config.js";
import { findLatestCompletedRunId } from "../repositories/ingestion-run-repository.js";
import {
  countAnalysedIncidents,
  countIncidentsInRun,
  listFindingsForRun,
  listIncidentsForClassification,
} from "../repositories/ai-incident-repository.js";
import type { AiFindingRow, IncidentForClassification } from "../repositories/ai-incident-repository.js";

export interface AnalysisVersion {
  model: string;
  promptVersion: string;
}

function resolveConfiguredAnalysisVersion(): AnalysisVersion | null {
  const model = process.env.OPENAI_MODEL?.trim();
  if (!model) {
    return null;
  }
  return {
    model,
    promptVersion: PROMPT_VERSION,
  };
}

function groupFindingsByIncident(
  findings: AiFindingRow[],
): Map<string, AiFindingRow[]> {
  const grouped = new Map<string, AiFindingRow[]>();
  for (const finding of findings) {
    const existing = grouped.get(finding.incident_id) ?? [];
    existing.push(finding);
    grouped.set(finding.incident_id, existing);
  }
  return grouped;
}

export function reviewPriority(incident: {
  psychosocialAssessment: string | null;
  severityAssessment: string | null;
  analysisStatus: string;
}): number {
  if (incident.psychosocialAssessment === "yes") {
    return 0;
  }
  if (incident.severityAssessment === "possibly_inconsistent") {
    return 1;
  }
  if (
    incident.psychosocialAssessment === "uncertain" ||
    incident.severityAssessment === "uncertain"
  ) {
    return 2;
  }
  if (incident.analysisStatus === "complete") {
    return 10;
  }
  if (incident.analysisStatus === "partial") {
    return 20;
  }
  return 30;
}

function mapPsychosocialAssessment(value: boolean | null | undefined): string | null {
  if (value === true) {
    return "yes";
  }
  if (value === false) {
    return "no";
  }
  if (value === null) {
    return "uncertain";
  }
  return null;
}

function mapSeverityAssessment(value: boolean | null | undefined): string | null {
  if (value === true) {
    return "possibly_inconsistent";
  }
  if (value === false) {
    return "consistent";
  }
  if (value === null) {
    return "uncertain";
  }
  return null;
}

function serialiseReviewIncident(
  incident: IncidentForClassification,
  findings: AiFindingRow[],
  version: AnalysisVersion | null,
) {
  const byType = new Map(findings.map((finding) => [finding.finding_type, finding]));
  const categoryFinding = byType.get("safety_category");
  const psychFinding = byType.get("psychosocial_hazard");
  const severityFinding = byType.get("severity_inconsistency");

  const analysisStatus =
    findings.length >= 3 ? "complete" : findings.length > 0 ? "partial" : "pending";

  const psychosocialAssessment = mapPsychosocialAssessment(
    psychFinding?.is_psychosocial_hazard,
  );
  const severityAssessment = mapSeverityAssessment(severityFinding?.severity_inconsistent);

  return {
    id: incident.id,
    sourceIncidentId: incident.source_incident_id,
    description: incident.description,
    severityRaw: incident.severity_raw,
    severityNormalised: incident.severity_normalised,
    severityLabel: incident.severity_label,
    typeCode: incident.type_code,
    analysisStatus,
    safetyCategory: categoryFinding?.safety_category ?? null,
    psychosocialAssessment,
    severityAssessment,
    evidence: {
      safetyCategory: categoryFinding?.evidence_excerpt ?? null,
      psychosocial: psychFinding?.evidence_excerpt ?? null,
      severity: severityFinding?.evidence_excerpt ?? null,
    },
    explanations: {
      safetyCategory: categoryFinding?.explanation ?? null,
      psychosocial: psychFinding?.explanation ?? null,
      severity: severityFinding?.explanation ?? null,
    },
    confidence: {
      safetyCategory: categoryFinding ? Number(categoryFinding.confidence) : null,
      psychosocial: psychFinding ? Number(psychFinding.confidence) : null,
      severity: severityFinding ? Number(severityFinding.confidence) : null,
    },
    model: categoryFinding?.model ?? version?.model ?? null,
    promptVersion: categoryFinding?.prompt_version ?? version?.promptVersion ?? null,
    sourceFilename: incident.source_filename,
    sourceRow: incident.source_row,
    requiresHumanReview: findings.some((finding) => finding.requires_human_review),
    reviewPriority: reviewPriority({
      psychosocialAssessment,
      severityAssessment,
      analysisStatus,
    }),
  };
}

export async function getAiSummary() {
  const ingestionRunId = await findLatestCompletedRunId();
  const version = resolveConfiguredAnalysisVersion();
  const totalIncidents = await countIncidentsInRun(ingestionRunId);

  if (!version) {
    return {
      ingestionRunId,
      model: null,
      promptVersion: PROMPT_VERSION,
      configurationStatus: "OPENAI_MODEL not configured",
      totalIncidents,
      analysedIncidentCount: 0,
      pendingIncidentCount: totalIncidents,
      safetyCategoryCounts: [],
      psychosocialCounts: {
        yes: 0,
        no: 0,
        uncertain: 0,
        pending: totalIncidents,
      },
      severityCounts: {
        consistent: 0,
        possiblyInconsistent: 0,
        uncertain: 0,
        pending: totalIncidents,
      },
    };
  }

  const [analysedIncidentCount, findings, incidents] = await Promise.all([
    countAnalysedIncidents(ingestionRunId, version.model, version.promptVersion),
    listFindingsForRun(ingestionRunId, version.model, version.promptVersion),
    listIncidentsForClassification(ingestionRunId),
  ]);

  const pendingIncidentCount = totalIncidents - analysedIncidentCount;
  const safetyCategoryCounts = new Map<string, number>();
  const psychosocialCounts = { yes: 0, no: 0, uncertain: 0, pending: 0 };
  const severityCounts = {
    consistent: 0,
    possiblyInconsistent: 0,
    uncertain: 0,
    pending: 0,
  };

  const grouped = groupFindingsByIncident(findings);
  for (const incident of incidents) {
    const incidentFindings = grouped.get(incident.id) ?? [];
    const categoryFinding = incidentFindings.find((f) => f.finding_type === "safety_category");
    const psychFinding = incidentFindings.find((f) => f.finding_type === "psychosocial_hazard");
    const severityFinding = incidentFindings.find(
      (f) => f.finding_type === "severity_inconsistency",
    );

    if (!categoryFinding || !psychFinding || !severityFinding) {
      psychosocialCounts.pending += 1;
      severityCounts.pending += 1;
      continue;
    }

    if (categoryFinding.safety_category) {
      safetyCategoryCounts.set(
        categoryFinding.safety_category,
        (safetyCategoryCounts.get(categoryFinding.safety_category) ?? 0) + 1,
      );
    }

    if (psychFinding.is_psychosocial_hazard === true) {
      psychosocialCounts.yes += 1;
    } else if (psychFinding.is_psychosocial_hazard === false) {
      psychosocialCounts.no += 1;
    } else {
      psychosocialCounts.uncertain += 1;
    }

    if (severityFinding.severity_inconsistent === true) {
      severityCounts.possiblyInconsistent += 1;
    } else if (severityFinding.severity_inconsistent === false) {
      severityCounts.consistent += 1;
    } else {
      severityCounts.uncertain += 1;
    }
  }

  return {
    ingestionRunId,
    model: version.model,
    promptVersion: version.promptVersion,
    configurationStatus: hasOpenAiConfig() ? "configured" : "partial",
    totalIncidents,
    analysedIncidentCount,
    pendingIncidentCount,
    safetyCategoryCounts: [...safetyCategoryCounts.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => a.category.localeCompare(b.category)),
    psychosocialCounts,
    severityCounts,
  };
}

export async function getIncidentsReview() {
  const ingestionRunId = await findLatestCompletedRunId();
  const version = resolveConfiguredAnalysisVersion();
  const [incidents, findings] = await Promise.all([
    listIncidentsForClassification(ingestionRunId),
    version
      ? listFindingsForRun(ingestionRunId, version.model, version.promptVersion)
      : Promise.resolve([]),
  ]);

  const grouped = groupFindingsByIncident(findings);
  const reviewIncidents = incidents
    .map((incident) =>
      serialiseReviewIncident(incident, grouped.get(incident.id) ?? [], version),
    )
    .sort((a, b) => {
      if (a.reviewPriority !== b.reviewPriority) {
        return a.reviewPriority - b.reviewPriority;
      }
      return a.sourceIncidentId.localeCompare(b.sourceIncidentId);
    })
    .map(({ reviewPriority: _reviewPriority, ...incident }) => incident);

  return {
    ingestionRunId,
    model: version?.model ?? null,
    promptVersion: version?.promptVersion ?? PROMPT_VERSION,
    count: reviewIncidents.length,
    incidents: reviewIncidents,
  };
}

export async function getIncidentAiStatusMap(
  runId: string,
): Promise<Map<string, "complete" | "partial" | "pending">> {
  const version = resolveConfiguredAnalysisVersion();
  if (!version) {
    const incidents = await listIncidentsForClassification(runId);
    return new Map(incidents.map((incident) => [incident.id, "pending" as const]));
  }

  const findings = await listFindingsForRun(runId, version.model, version.promptVersion);
  const grouped = groupFindingsByIncident(findings);
  const status = new Map<string, "complete" | "partial" | "pending">();

  for (const [incidentId, incidentFindings] of grouped) {
    status.set(
      incidentId,
      incidentFindings.length >= 3 ? "complete" : "partial",
    );
  }

  const incidents = await listIncidentsForClassification(runId);
  for (const incident of incidents) {
    if (!status.has(incident.id)) {
      status.set(incident.id, "pending");
    }
  }

  return status;
}
