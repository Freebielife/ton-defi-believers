import path from "node:path";
import { performance } from "node:perf_hooks";
import { collectStonfi } from "./adapters/stonfi.mjs";
import { collectDedust } from "./adapters/dedust.mjs";
import { collectProtocolPlaceholder } from "./adapters/protocol-placeholder.mjs";
import { writeHealthFiles } from "./lib/health-monitor.mjs";
import { nowIso, readJson, writeJsonAtomic } from "./lib/utils.mjs";

const root = process.cwd();
const opportunitiesPath = path.join(root, "data", "opportunities.json");
const reportPath = path.join(root, "data", "collector-report.json");
const registry = await readJson(path.join(root, "config", "protocol-sources.json"));
const document = await readJson(opportunitiesPath);
const startedAt = nowIso();

let opportunities = document.opportunities;
const reports = [];

async function run(adapterName, fn) {
  const started = performance.now();

  try {
    const result = await fn();
    opportunities = result.opportunities;
    reports.push({
      ...result.report,
      durationMs: Math.round(performance.now() - started)
    });
  } catch (error) {
    reports.push({
      adapter: adapterName,
      status: "error",
      retainedPreviousData: true,
      durationMs: Math.round(performance.now() - started),
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

for (const source of registry.protocols.filter((item) => item.enabled)) {
  if (source.adapter === "stonfi") {
    await run("stonfi", () => collectStonfi({
      configPath: path.join(root, "config", "stonfi-pools.json"),
      opportunities
    }));
    continue;
  }

  if (source.adapter === "dedust") {
    await run("dedust", () => collectDedust({
      configPath: path.join(root, "config", "dedust-pools.json"),
      opportunities
    }));
    continue;
  }

  await run(source.adapter, () => collectProtocolPlaceholder({
    adapter: source.adapter,
    configPath: path.join(root, "config", `${source.adapter}.json`),
    opportunities,
    source
  }));
}

const freshStatuses = new Set(["ok", "partial"]);
const publishedFreshData = reports.some((item) => freshStatuses.has(item.status));
const finishedAt = nowIso();

if (publishedFreshData) {
  await writeJsonAtomic(opportunitiesPath, {
    ...document,
    updatedAt: finishedAt,
    opportunities
  });
} else {
  console.warn(
    "No adapter produced fresh automatic data. Previous opportunities snapshot retained."
  );
}

const summary = {
  total: reports.length,
  automatic: reports.filter((item) =>
    ["ok", "partial", "catalog-ready-no-tracked-opportunities"].includes(item.status)
  ).length,
  pendingVerification: reports.filter((item) =>
    ["integration-ready", "manual-until-public-source", "needs-review"].includes(item.status)
  ).length,
  errors: reports.filter((item) => item.status === "error").length,
  publishedFreshData,
  retainedPreviousSnapshot: !publishedFreshData
};

await writeJsonAtomic(reportPath, {
  schemaVersion: "1.1",
  generatedAt: finishedAt,
  sourcePolicy: registry.policy,
  adapters: reports,
  summary
});

const health = await writeHealthFiles({
  root,
  reports,
  startedAt,
  finishedAt,
  previousSnapshotUpdatedAt: document.updatedAt ?? null,
  publishedFreshData
});

console.log(JSON.stringify({ adapters: reports, summary, health }, null, 2));
