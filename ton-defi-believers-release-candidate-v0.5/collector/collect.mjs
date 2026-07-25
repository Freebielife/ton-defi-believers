import path from "node:path";
import { collectStonfi } from "./adapters/stonfi.mjs";
import { collectDedust } from "./adapters/dedust.mjs";
import { collectProtocolPlaceholder } from "./adapters/protocol-placeholder.mjs";
import { nowIso, readJson, writeJsonAtomic } from "./lib/utils.mjs";

const root = process.cwd();
const opportunitiesPath = path.join(root, "data", "opportunities.json");
const reportPath = path.join(root, "data", "collector-report.json");
const registry = await readJson(path.join(root, "config", "protocol-sources.json"));
const document = await readJson(opportunitiesPath);

let opportunities = document.opportunities;
const reports = [];

async function run(adapterName, fn) {
  try {
    const result = await fn();
    opportunities = result.opportunities;
    reports.push(result.report);
  } catch (error) {
    reports.push({
      adapter: adapterName,
      status: "error",
      retainedPreviousData: true,
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

await writeJsonAtomic(opportunitiesPath, {
  ...document,
  updatedAt: nowIso(),
  opportunities
});

await writeJsonAtomic(reportPath, {
  schemaVersion: "1.0",
  generatedAt: nowIso(),
  sourcePolicy: registry.policy,
  adapters: reports,
  summary: {
    total: reports.length,
    automatic: reports.filter((item) => ["ok", "partial", "catalog-ready-no-tracked-opportunities"].includes(item.status)).length,
    pendingVerification: reports.filter((item) =>
      ["integration-ready", "manual-until-public-source", "needs-review"].includes(item.status)
    ).length,
    errors: reports.filter((item) => item.status === "error").length
  }
});

console.log(JSON.stringify(reports, null, 2));
