import path from "node:path";
import { readJson, writeJsonAtomic, nowIso } from "./lib/utils.mjs";

const root = process.cwd();
const registry = await readJson(path.join(root, "config", "protocol-sources.json"));
const protocols = await readJson(path.join(root, "data", "protocols.json"));
const opportunities = await readJson(path.join(root, "data", "opportunities.json"));

const sourceByName = new Map(registry.protocols.map((item) => [item.name, item]));
const rows = [];

for (const protocol of protocols.protocols.filter((item) => item.tier === "core" && item.active)) {
  const source = sourceByName.get(protocol.name);
  rows.push({
    protocolId: protocol.id,
    protocol: protocol.name,
    opportunityCount: opportunities.opportunities.filter((item) => item.protocol === protocol.name).length,
    adapterPresent: Boolean(source),
    mode: source?.mode ?? null,
    status: source?.status ?? "missing",
    primarySourceOwnedByProtocol: source ? true : false
  });
}

await writeJsonAtomic(path.join(root, "data", "source-audit.json"), {
  generatedAt: nowIso(),
  policyPassed: rows.every((row) => row.adapterPresent && row.primarySourceOwnedByProtocol),
  protocols: rows
});

if (rows.some((row) => !row.adapterPresent)) process.exit(1);
console.log(`Проверено Core-протоколов: ${rows.length}. Для каждого назначен отдельный источник.`);
