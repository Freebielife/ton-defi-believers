import path from "node:path";
import { nowIso, readJson, writeJsonAtomic } from "./utils.mjs";

const SUCCESS_STATUSES = new Set(["ok", "partial"]);
const DEGRADED_STATUSES = new Set([
  "needs-review",
  "catalog-ready-no-tracked-opportunities",
  "integration-ready",
  "manual-until-public-source",
  "source-pending"
]);

function healthStatus(report) {
  if (SUCCESS_STATUSES.has(report.status)) return report.status;
  if (report.status === "error") return "error";
  if (report.status === "disabled") return "disabled";
  if (DEGRADED_STATUSES.has(report.status)) return "degraded";
  return "unknown";
}

function countItems(report) {
  const values = [
    report.updated,
    report.uniquePoolsReceived,
    report.poolsReceived,
    report.assetsReceived,
    report.retainedExistingRecords
  ];

  for (const value of values) {
    if (Number.isFinite(Number(value))) return Number(value);
  }

  return 0;
}

function buildQualityScore(protocols) {
  const active = protocols.filter((item) => item.status !== "disabled");
  if (!active.length) return 0;

  const weights = {
    ok: 100,
    partial: 75,
    degraded: 45,
    unknown: 25,
    error: 0
  };

  const average = active.reduce(
    (total, item) => total + (weights[item.status] ?? 0),
    0
  ) / active.length;

  return Math.round(average);
}

function overallStatus(protocols) {
  const active = protocols.filter((item) => item.status !== "disabled");
  if (!active.length) return "unknown";
  if (active.every((item) => item.status === "error")) return "down";
  if (active.some((item) => ["error", "degraded", "unknown"].includes(item.status))) {
    return "degraded";
  }
  if (active.some((item) => item.status === "partial")) return "partial";
  return "ok";
}

export function buildHealthDocument({
  reports,
  startedAt,
  finishedAt = nowIso(),
  previousSnapshotUpdatedAt = null,
  publishedFreshData = false
}) {
  const protocols = reports.map((report) => ({
    adapter: report.adapter,
    protocol: report.protocol ?? report.adapter,
    status: healthStatus(report),
    sourceStatus: report.status,
    durationMs: Number.isFinite(Number(report.durationMs))
      ? Number(report.durationMs)
      : null,
    items: countItems(report),
    updated: Number.isFinite(Number(report.updated))
      ? Number(report.updated)
      : 0,
    unresolved: Number.isFinite(Number(report.unresolved))
      ? Number(report.unresolved)
      : 0,
    retainedPreviousData: Boolean(report.retainedPreviousData),
    message: report.message ?? null
  }));

  const durations = protocols
    .map((item) => item.durationMs)
    .filter((value) => Number.isFinite(value));

  return {
    schemaVersion: "1.0",
    generatedAt: finishedAt,
    run: {
      startedAt,
      finishedAt,
      durationMs: Math.max(
        0,
        new Date(finishedAt).getTime() - new Date(startedAt).getTime()
      ),
      publishedFreshData,
      previousSnapshotUpdatedAt
    },
    status: overallStatus(protocols),
    buildQuality: buildQualityScore(protocols),
    summary: {
      total: protocols.length,
      healthy: protocols.filter((item) => item.status === "ok").length,
      partial: protocols.filter((item) => item.status === "partial").length,
      degraded: protocols.filter((item) => item.status === "degraded").length,
      errors: protocols.filter((item) => item.status === "error").length,
      disabled: protocols.filter((item) => item.status === "disabled").length,
      averageDurationMs: durations.length
        ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
        : null
    },
    protocols
  };
}

export async function writeHealthFiles({
  root = process.cwd(),
  reports,
  startedAt,
  finishedAt = nowIso(),
  previousSnapshotUpdatedAt = null,
  publishedFreshData = false,
  historyLimit = 168
}) {
  const healthPath = path.join(root, "data", "health.json");
  const historyPath = path.join(root, "data", "health-history.json");

  const health = buildHealthDocument({
    reports,
    startedAt,
    finishedAt,
    previousSnapshotUpdatedAt,
    publishedFreshData
  });

  let history = {
    schemaVersion: "1.0",
    updatedAt: finishedAt,
    limit: historyLimit,
    entries: []
  };

  try {
    history = await readJson(historyPath);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const entries = [
    ...(Array.isArray(history.entries) ? history.entries : []),
    {
      generatedAt: health.generatedAt,
      status: health.status,
      buildQuality: health.buildQuality,
      durationMs: health.run.durationMs,
      publishedFreshData: health.run.publishedFreshData,
      protocols: Object.fromEntries(
        health.protocols.map((item) => [
          item.adapter,
          {
            status: item.status,
            sourceStatus: item.sourceStatus,
            durationMs: item.durationMs,
            items: item.items
          }
        ])
      )
    }
  ].slice(-historyLimit);

  await writeJsonAtomic(healthPath, health);
  await writeJsonAtomic(historyPath, {
    schemaVersion: "1.0",
    updatedAt: finishedAt,
    limit: historyLimit,
    entries
  });

  return health;
}
