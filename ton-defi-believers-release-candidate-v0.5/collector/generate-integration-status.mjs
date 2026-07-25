import path from "node:path";
import { nowIso, readJson, writeJsonAtomic } from "./lib/utils.mjs";

const root = process.cwd();
const registry = await readJson(path.join(root, "config", "protocol-sources.json"));
const opportunities = await readJson(path.join(root, "data", "opportunities.json"));

const rows = registry.protocols.map((protocol) => {
  const count = opportunities.opportunities.filter(
    (item) => item.protocol === protocol.name
  ).length;

  const level = protocol.automationLevel ?? "unknown";
  const isAutomatic = ["automatic", "automatic-catalog"].includes(level);
  const isReady = ["sdk-ready", "api-ready", "onchain-ready"].includes(level);

  return {
    id: protocol.id,
    protocol: protocol.name,
    opportunityCount: count,
    automationLevel: level,
    verification: protocol.verification ?? "unverified",
    automaticNow: isAutomatic,
    integrationReady: isAutomatic || isReady,
    metrics: protocol.metrics ?? [],
    primarySource: protocol.official ?? {},
    contracts: protocol.contracts ?? null
  };
});

await writeJsonAtomic(path.join(root, "data", "integration-status.json"), {
  schemaVersion: "1.0",
  generatedAt: nowIso(),
  summary: {
    protocols: rows.length,
    automaticNow: rows.filter((row) => row.automaticNow).length,
    integrationReady: rows.filter((row) => row.integrationReady).length,
    manualOrPending: rows.filter((row) => !row.integrationReady).length
  },
  definitions: {
    automaticNow: "Collector can currently refresh at least part of this protocol automatically.",
    integrationReady: "Official SDK/API/contracts are identified, but metric mapping may still require verification.",
    manualOrPending: "No stable verified public metric source is fixed yet."
  },
  protocols: rows
});

console.log(
  `Протоколов: ${rows.length}; автоматически сейчас: ${
    rows.filter((row) => row.automaticNow).length
  }; готовы к следующей интеграции: ${
    rows.filter((row) => row.integrationReady).length
  }.`
);
